import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * External orders.
 *
 * The same event_requests row as an internal request, so everything
 * downstream - the queue, the schedule, the catering sheet, close-out
 * and reporting - works without knowing where it came from.
 *
 * What differs is the front: no classification questions, because an
 * outside customer cannot reasonably answer whether Central is the
 * primary beneficiary. The answers are recorded as the external case
 * and staff confirm or correct.
 */

const Body = z.object({
  organization: z.string().max(200).nullable(),
  contactPhone: z.string().max(50).nullable(),
  eventName: z.string().min(1).max(200),
  eventPurpose: z.string().max(4000).nullable(),
  eventDate: z.string().date(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  spaceId: z.string().uuid().nullable(),
  locationFreetext: z.string().max(300).nullable(),
  guests: z.number().int().positive().max(20_000),
  selections: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(10_000),
        choices: z
          .array(
            z.object({
              optionId: z.string().uuid(),
              quantity: z.number().int().positive().max(10_000).nullable(),
            })
          )
          .max(40)
          .optional(),
      })
    )
    .max(100),
  serviceExpectations: z.string().max(4000).nullable(),
  roomSetup: z.string().max(4000).nullable(),
  dietaryRestrictions: z.string().max(4000).nullable(),
  specialRequests: z.string().max(4000).nullable(),
  alcoholRequested: z.boolean(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to place an order.' },
      { status: 401 }
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Some details are missing. Check the form and try again.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  try {
    const result = await transaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO event_requests (
           requester_id, requester_name, department_org, contact_email,
           contact_phone, event_name, event_purpose, event_type_other,
           event_date, start_time, end_time, space_id, location_freetext,
           estimated_attendance, status, submitted_at, submitted_via
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                   'submitted', now(), 'external_order')
         RETURNING id, reference_code`,
        [
          user.id, user.full_name,
          b.organization || 'Private individual',
          user.email, b.contactPhone,
          b.eventName, b.eventPurpose,
          // The ordering page does not ask for an event type: an
          // outside customer cannot reasonably answer the
          // classification matrix. Recording that plainly beats
          // guessing a type nobody chose.
          'Not asked - placed through the public ordering page',
          b.eventDate,
          b.startTime, b.endTime, b.spaceId, b.locationFreetext,
          b.guests,
        ]
      );
      const r = rows[0];

      await c.query(
        `INSERT INTO event_food_sources (request_id, kind)
         VALUES ($1, $2::food_source_kind)`,
        [r.id, b.selections.length > 0 ? 'central_dining' : 'no_food']
      );

      await c.query(
        `INSERT INTO event_requirements
           (request_id, service_expectations, room_setup,
            dietary_restrictions, special_requests)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          r.id, b.serviceExpectations, b.roomSetup,
          b.dietaryRestrictions,
          b.alcoholRequested
            ? `${b.specialRequests ?? ''}\n\nBar service requested.`.trim()
            : b.specialRequests,
        ]
      );

      // An outside customer is external by default. Recorded as their
      // answers rather than as a decision, so staff still classify.
      await c.query(
        `INSERT INTO event_funding
           (request_id, outside_org_involved, outside_funding,
            revenue_collected, financial_risk_bearer)
         VALUES ($1, true, false, false, 'outside')`,
        [r.id]
      );

      await c.query(
        `INSERT INTO classification_answers
           (request_id, official_business, event_owner, primary_beneficiary,
            primary_payer, would_occur_without, suggested_class,
            suggested_rationale, requester_notes)
         VALUES ($1, 'no', 'outside', 'outside', 'outside', 'yes',
                 'external',
                 'Placed through the public ordering page by an outside customer.',
                 $2)`,
        [r.id, b.eventPurpose]
      );

      // Prices are read from the external tier here rather than trusted
      // from the browser, and flagged as quoted before classification
      // so a reclassification reprices them automatically.
      for (const s of b.selections) {
        const { rows: price } = await c.query(
          `SELECT unit_price FROM menu_item_prices
            WHERE menu_item_id = $1 AND path = 'external_commercial'
              AND effective_from <= CURRENT_DATE
              AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
            ORDER BY effective_from DESC LIMIT 1`,
          [s.menuItemId]
        );
        if (!price[0]) continue;

        // Options that cost extra are part of the per-person price, so
        // the line total is right without a separate charge to
        // reconcile later.
        let unitPrice = Number(price[0].unit_price);
        if (s.choices?.length) {
          const { rows: deltas } = await c.query(
            `SELECT coalesce(sum(price_delta), 0) AS d
               FROM menu_choice_options
              WHERE id = ANY($1::uuid[])`,
            [s.choices.map((ch) => ch.optionId)]
          );
          unitPrice += Number(deltas[0]?.d ?? 0);
        }

        const { rows: selRows } = await c.query(
          `INSERT INTO request_menu_selections
             (request_id, menu_item_id, quantity, unit_price_quoted,
              quoted_before_classification)
           VALUES ($1,$2,$3,$4,true)
           RETURNING id`,
          [r.id, s.menuItemId, s.quantity, unitPrice]
        );

        for (const ch of s.choices ?? []) {
          // The option must belong to a group on this very item,
          // checked in the insert rather than trusted.
          await c.query(
            `INSERT INTO selection_choices (selection_id, option_id, quantity)
             SELECT $1, o.id, $3
               FROM menu_choice_options o
               JOIN menu_choice_groups g ON g.id = o.group_id
              WHERE o.id = $2 AND g.menu_item_id = $4
             ON CONFLICT DO NOTHING`,
            [selRows[0].id, ch.optionId, ch.quantity, s.menuItemId]
          );
        }
      }

      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, 'draft', 'submitted', $2, 'Order placed online')`,
        [r.id, user.id]
      );

      return r;
    });

    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Central Catering <noreply@central.edu>',
          to: process.env.EVENTS_INBOX,
          subject: `New catering order ${result.reference_code} - ${b.eventName}`,
          text: `An outside customer has placed an order.\n\n${process.env.AUTH_URL ?? ''}/staff\n`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ referenceCode: result.reference_code });
  } catch (err) {
    console.error('order failed:', err);
    return NextResponse.json(
      {
        error: 'Could not place your order. Please call us on 641.628.5788.',
        // Only in development. A customer gets the phone number; a
        // developer gets something they can act on.
        detail:
          process.env.NODE_ENV === 'development' && err instanceof Error
            ? err.message
            : undefined,
      },
      { status: 500 }
    );
  }
}
