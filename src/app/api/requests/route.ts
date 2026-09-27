import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * A request for an event.
 *
 * One form, one call. The classification questions are gone: staff
 * read the description and the funding and decide. What arrives here
 * is what the requester actually knows.
 *
 * A menu chosen now is quoted at the external rate and flagged. The
 * trigger on classification_decisions reprices it the moment staff
 * classify, so nobody is quoted a number that turns out to be wrong.
 */

const Body = z.object({
  requesterName: z.string().min(1, 'Enter your name').max(200),
  departmentOrg: z.string().min(1, 'Enter your department').max(200),
  contactPhone: z.string().max(50).nullable(),

  eventName: z.string().min(1, 'Name your event').max(200),
  eventTypeId: z.string().uuid().nullable(),
  eventTypeOther: z.string().max(200).nullable(),
  eventDescription: z.string().max(8000).nullable(),

  eventDate: z.string().date(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  spaceId: z.string().uuid().nullable(),
  locationFreetext: z.string().max(300).nullable(),
  estimatedAttendance: z.number().int().positive().max(20_000),

  foodSource: z.enum([
    'central_dining', 'outside_caterer', 'donated', 'no_food',
  ]),
  catererName: z.string().max(200).nullable(),
  dietaryRestrictions: z.string().max(4000).nullable(),

  menuSelections: z
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
    .max(100)
    .optional(),

  setupSelections: z
    .array(
      z.object({
        optionId: z.string().uuid(),
        count: z.number().int().positive().max(500).nullable(),
      })
    )
    .max(40)
    .optional(),
  setupNotes: z.string().max(4000).nullable(),

  funding: z.object({
    budgetAccount: z.string().max(100).nullable(),
    outsideOrgName: z.string().max(200).nullable(),
    outsideFunding: z.boolean(),
    outsideFundingDetail: z.string().max(1000).nullable(),
    revenueCollected: z.boolean(),
    revenueRecipient: z.string().max(200).nullable(),
    financialRiskBearer: z.enum(['central', 'shared', 'outside', 'unclear']),
  }),

  shortNotice: z.boolean().default(false),
  shortNoticeReason: z.string().max(2000).nullable().optional(),
  submittedComplete: z.boolean().default(false),
});

const FIELD_LABELS: Record<string, string> = {
  requesterName: 'Your name',
  departmentOrg: 'Department or organization',
  eventName: 'Event name',
  eventDate: 'Date',
  estimatedAttendance: 'How many people',
  foodSource: 'Who is providing the food',
  'funding.financialRiskBearer': 'Who carries the risk',
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to send a request.' },
      { status: 401 }
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const label =
        FIELD_LABELS[path] ??
        FIELD_LABELS[issue.path[0] as string] ??
        (path || 'A required answer');
      if (seen.has(label)) continue;
      seen.add(label);
      parts.push(label);
    }
    return NextResponse.json(
      { error: `Still needed: ${parts.join(', ')}.` },
      { status: 400 }
    );
  }
  const b = parsed.data;

  // Checked here rather than trusted from the browser.
  let isShort = false;
  if (b.spaceId) {
    const check = await one<{ is_short: boolean }>(
      'SELECT is_short FROM notice_check($1, $2, $3)',
      [b.spaceId, b.eventDate, b.startTime]
    );
    isShort = check?.is_short ?? false;
  }

  try {
    const request = await transaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO event_requests (
           requester_id, requester_name, department_org, contact_email,
           contact_phone, event_type_id, event_type_other,
           event_name, event_description, event_date,
           start_time, end_time, space_id, location_freetext,
           estimated_attendance, short_notice, short_notice_state,
           short_notice_reason, submitted_complete,
           status, submitted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                   $16,$17,$18,$19,'submitted',now())
         RETURNING id, reference_code`,
        [
          user.id, b.requesterName, b.departmentOrg, user.email,
          b.contactPhone, b.eventTypeId, b.eventTypeOther,
          b.eventName, b.eventDescription, b.eventDate,
          b.startTime, b.endTime, b.spaceId, b.locationFreetext,
          b.estimatedAttendance,
          isShort, isShort ? 'pending' : null,
          isShort ? (b.shortNoticeReason ?? null) : null,
          b.submittedComplete,
        ]
      );
      const r = rows[0];

      await c.query(
        `INSERT INTO event_food_sources
           (request_id, kind, caterer_other)
         VALUES ($1, $2::food_source_kind, $3)`,
        [r.id, b.foodSource, b.catererName]
      );

      await c.query(
        `INSERT INTO event_requirements
           (request_id, dietary_restrictions, special_requests)
         VALUES ($1, $2, $3)`,
        [r.id, b.dietaryRestrictions, b.setupNotes]
      );

      await c.query(
        `INSERT INTO event_funding
           (request_id, budget_account, outside_org_involved,
            outside_org_name, outside_funding, outside_funding_detail,
            revenue_collected, revenue_recipient, financial_risk_bearer)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          r.id, b.funding.budgetAccount,
          !!b.funding.outsideOrgName?.trim(),
          b.funding.outsideOrgName, b.funding.outsideFunding,
          b.funding.outsideFundingDetail, b.funding.revenueCollected,
          b.funding.revenueRecipient, b.funding.financialRiskBearer,
        ]
      );

      // The row still exists for the notes field and for anything
      // written before September 2026. The matrix answers are no
      // longer asked and stay null.
      await c.query(
        `INSERT INTO classification_answers (request_id, requester_notes)
         VALUES ($1, $2)`,
        [r.id, b.eventDescription]
      );

      for (const sel of b.setupSelections ?? []) {
        await c.query(
          `INSERT INTO request_setup_selections (request_id, option_id, count)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [r.id, sel.optionId, sel.count]
        );
      }

      // Quoted at the external rate and flagged. Classifying the
      // event reprices every one of these.
      for (const sel of b.menuSelections ?? []) {
        const { rows: price } = await c.query(
          `SELECT unit_price FROM menu_item_prices
            WHERE menu_item_id = $1 AND path = 'external_commercial'
              AND effective_from <= CURRENT_DATE
              AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
            ORDER BY effective_from DESC LIMIT 1`,
          [sel.menuItemId]
        );
        if (!price[0]) continue;

        let unitPrice = Number(price[0].unit_price);
        if (sel.choices?.length) {
          const { rows: deltas } = await c.query(
            `SELECT coalesce(sum(price_delta), 0) AS d
               FROM menu_choice_options WHERE id = ANY($1::uuid[])`,
            [sel.choices.map((ch) => ch.optionId)]
          );
          unitPrice += Number(deltas[0]?.d ?? 0);
        }

        const { rows: selRows } = await c.query(
          `INSERT INTO request_menu_selections
             (request_id, menu_item_id, quantity, unit_price_quoted,
              quoted_before_classification)
           VALUES ($1,$2,$3,$4,true)
           RETURNING id`,
          [r.id, sel.menuItemId, sel.quantity, unitPrice]
        );

        for (const ch of sel.choices ?? []) {
          await c.query(
            `INSERT INTO selection_choices (selection_id, option_id, quantity)
             SELECT $1, o.id, $3
               FROM menu_choice_options o
               JOIN menu_choice_groups g ON g.id = o.group_id
              WHERE o.id = $2 AND g.menu_item_id = $4
             ON CONFLICT DO NOTHING`,
            [selRows[0].id, ch.optionId, ch.quantity, sel.menuItemId]
          );
        }
      }

      // A complete submission records its menu as settled, so the
      // requester is not sent back through a step they have done.
      if (b.submittedComplete && (b.menuSelections?.length ?? 0) > 0) {
        await c.query(
          `UPDATE event_requests
              SET menu_confirmed_at = now(), menu_confirmed_by = $2
            WHERE id = $1`,
          [r.id, user.id]
        );
      }

      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, 'draft', 'submitted', $2, 'Request submitted')`,
        [r.id, user.id]
      );

      return r;
    });

    return NextResponse.json({
      id: request.id,
      referenceCode: request.reference_code,
    });
  } catch (err) {
    console.error('request failed:', err);
    return NextResponse.json(
      { error: 'Could not send your request. Please try again.' },
      { status: 500 }
    );
  }
}
