import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Saving menu selections and the choices within them.
 *
 * Choices are validated against each group's own rules in SQL rather
 * than trusted from the form, so a tampered request cannot order a
 * buffet with six entrees.
 *
 * Add-ons are stored at the external rate and scaled to the tier
 * here, so a dollar of guacamole costs an internal department thirty
 * cents - the same discount as the food it sits on.
 */

const Choice = z.object({
  optionId: z.string().uuid(),
  quantity: z.number().int().positive().max(10_000).nullable(),
});

const Body = z.object({
  requestId: z.string().uuid(),
  confirm: z.boolean(),
  // Confirming the menu settles the food; confirming the details
  // sends the whole thing for final review.
  stage: z.enum(['menu', 'details']).default('details'),
  setupSelections: z
    .array(
      z.object({
        optionId: z.string().uuid(),
        count: z.number().int().positive().max(500).nullable(),
      })
    )
    .max(40)
    .optional(),
  policyAcknowledged: z.boolean().optional(),
  selections: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(10_000),
        notes: z.string().max(500).optional(),
        choices: z.array(Choice).max(40).optional(),
      })
    )
    .max(100),
  requirements: z.object({
    serviceExpectations: z.string().max(4000).optional(),
    specialRequests: z.string().max(4000).optional(),
    dietaryRestrictions: z.string().max(4000).optional(),
    // Setup, equipment and technology are the checklist now. The
    // columns remain for events submitted before September 2026.
    roomSetup: z.string().max(4000).optional(),
    equipment: z.string().max(4000).optional(),
    technology: z.string().max(4000).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check your selections.' }, { status: 400 });
  }
  const {
    requestId,
    confirm,
    stage,
    selections,
    setupSelections,
    requirements,
    policyAcknowledged,
  } = parsed.data;

  const owned = await one<{
    status: string;
    classification: string | null;
    revenue_collected: boolean | null;
  }>(
    `SELECT r.status, cd.classification, f.revenue_collected
       FROM event_requests r
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
       LEFT JOIN event_funding f ON f.request_id = r.id
      WHERE r.id = $1 AND r.requester_id = $2`,
    [requestId, user.id]
  );

  if (!owned) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  const gate = await one<{ ready: boolean }>(
    'SELECT ready_for_details($1) AS ready',
    [requestId]
  );
  if (!gate?.ready) {
    return NextResponse.json(
      {
        error:
          'This event is not ready for menu selection. Its classification or availability has changed since you opened this page.',
      },
      { status: 409 }
    );
  }

  const central = await one<{ has_central: boolean }>(
    'SELECT has_central_dining($1) AS has_central',
    [requestId]
  );
  const hasCentral = central?.has_central ?? true;

  try {
    await transaction(async (c) => {
      const { rows: tierRows } = await c.query(
        `SELECT CASE
                  WHEN cp.classification = 'internal' AND $2 THEN cp.revenue_path
                  ELSE cp.path
                END AS path
           FROM classification_pricing cp
          WHERE cp.classification = $1::classification`,
        [owned.classification, owned.revenue_collected ?? false]
      );
      const path = tierRows[0]?.path;
      if (hasCentral && !path) {
        throw new Error('No price tier for this classification');
      }

      // The same multiplier the menu prices use, so an add-on is
      // discounted like everything else on the order.
      const { rows: multRows } = await c.query(
        'SELECT tier_multiplier($1::financial_path) AS m',
        [path]
      );
      const multiplier = Number(multRows[0]?.m ?? 1);

      await c.query('DELETE FROM request_menu_selections WHERE request_id = $1', [
        requestId,
      ]);

      for (const s of hasCentral ? selections : []) {
        const { rows: priceRows } = await c.query(
          `SELECT unit_price FROM menu_item_prices
            WHERE menu_item_id = $1 AND path = $2
              AND effective_from <= CURRENT_DATE
              AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
            ORDER BY effective_from DESC LIMIT 1`,
          [s.menuItemId, path]
        );
        if (!priceRows[0]) continue;

        let unitPrice = Number(priceRows[0].unit_price);
        if (s.choices?.length) {
          const { rows: deltas } = await c.query(
            `SELECT coalesce(sum(price_delta), 0) AS d
               FROM menu_choice_options
              WHERE id = ANY($1::uuid[])`,
            [s.choices.map((ch) => ch.optionId)]
          );
          unitPrice += Number(deltas[0]?.d ?? 0) * multiplier;
        }

        const { rows: selRows } = await c.query(
          `INSERT INTO request_menu_selections
             (request_id, menu_item_id, quantity, unit_price_quoted, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            requestId,
            s.menuItemId,
            s.quantity,
            Math.round(unitPrice * 100) / 100,
            s.notes ?? null,
          ]
        );
        const selectionId = selRows[0].id;

        for (const ch of s.choices ?? []) {
          await c.query(
            `INSERT INTO selection_choices (selection_id, option_id, quantity)
             SELECT $1, o.id, $3
               FROM menu_choice_options o
               JOIN menu_choice_groups g ON g.id = o.group_id
              WHERE o.id = $2 AND g.menu_item_id = $4
             ON CONFLICT DO NOTHING`,
            [selectionId, ch.optionId, ch.quantity, s.menuItemId]
          );
        }

        const { rows: shortfall } = await c.query(
          `SELECT g.label, g.min_select, count(sc.id) AS chosen
             FROM menu_choice_groups g
             LEFT JOIN menu_choice_options o ON o.group_id = g.id
             LEFT JOIN selection_choices sc
                    ON sc.option_id = o.id AND sc.selection_id = $1
            WHERE g.menu_item_id = $2 AND g.min_select > 0
            GROUP BY g.id, g.label, g.min_select
           HAVING count(sc.id) < g.min_select`,
          [selectionId, s.menuItemId]
        );

        if (confirm && stage === 'menu' && shortfall.length > 0) {
          const { rows: itemRows } = await c.query(
            'SELECT name FROM menu_items WHERE id = $1',
            [s.menuItemId]
          );
          throw new Error(
            `${itemRows[0]?.name}: ${shortfall
              .map((r) => `choose ${r.min_select} for ${r.label}`)
              .join(', ')}`
          );
        }
      }

      // The setup picks are replaced wholesale: they are one answer
      // to one question, not a list of independent facts.
      if (stage === 'details' && setupSelections) {
        await c.query(
          'DELETE FROM request_setup_selections WHERE request_id = $1',
          [requestId]
        );
        for (const sel of setupSelections) {
          await c.query(
            `INSERT INTO request_setup_selections
               (request_id, option_id, count)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [requestId, sel.optionId, sel.count]
          );
        }
      }

      await c.query(
        `UPDATE event_requirements
            SET service_expectations = $2, room_setup = $3, equipment = $4,
                technology = $5, special_requests = $6,
                dietary_restrictions = $7, updated_at = now()
          WHERE request_id = $1`,
        [
          requestId,
          requirements.serviceExpectations ?? null,
          requirements.roomSetup ?? null,
          requirements.equipment ?? null,
          requirements.technology ?? null,
          requirements.specialRequests ?? null,
          requirements.dietaryRestrictions ?? null,
        ]
      );

      if (policyAcknowledged) {
        await c.query(
          `UPDATE event_food_sources
              SET policy_acknowledged_at = now(),
                  policy_acknowledged_by = $2
            WHERE request_id = $1
              AND kind IN ('outside_caterer', 'donated')
              AND policy_acknowledged_at IS NULL`,
          [requestId, user.id]
        );
      }

      if (confirm && stage === 'menu') {
        // The food is settled. The event is not ready for review until
        // the setup is done too, so the status does not move.
        await c.query(
          `UPDATE event_requests
              SET menu_confirmed_at = now(), menu_confirmed_by = $2,
                  updated_at = now()
            WHERE id = $1`,
          [requestId, user.id]
        );
      }

      if (confirm && stage === 'details') {
        await c.query(
          `UPDATE event_requests
              SET details_confirmed_at = now(), details_confirmed_by = $2,
                  menu_confirmed_at = coalesce(menu_confirmed_at, now()),
                  menu_confirmed_by = coalesce(menu_confirmed_by, $2),
                  status = 'pending_final_review', updated_at = now()
            WHERE id = $1`,
          [requestId, user.id]
        );
        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'pending_final_review', $3, 'Requester confirmed event details')`,
          [requestId, owned.status, user.id]
        );
      }
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('choose')
        ? err.message
        : 'Could not save your details.';
    console.error('details save failed:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, confirmed: confirm });
}
