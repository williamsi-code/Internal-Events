import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  confirm: z.boolean(),
  selections: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().max(10_000),
        notes: z.string().max(500).optional(),
      })
    )
    .max(100),
  requirements: z.object({
    serviceExpectations: z.string().max(4000).optional(),
    roomSetup: z.string().max(4000).optional(),
    equipment: z.string().max(4000).optional(),
    technology: z.string().max(4000).optional(),
    specialRequests: z.string().max(4000).optional(),
    dietaryRestrictions: z.string().max(4000).optional(),
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
  const { requestId, confirm, selections, requirements } = parsed.data;

  const owned = await one<{
    status: string;
    classification: string | null;
    acknowledged_at: Date | null;
    revenue_collected: boolean | null;
  }>(
    `SELECT r.status, cd.classification, cd.acknowledged_at, f.revenue_collected
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

  // Both halves of the gate. Details cannot be confirmed on an event
  // whose classification is unsettled or unacknowledged - the prices
  // shown would not be the prices that apply.
  if (!owned.classification || owned.classification === 'needs_management_review') {
    return NextResponse.json(
      { error: 'This event has not been classified yet.' },
      { status: 409 }
    );
  }
  if (!owned.acknowledged_at) {
    return NextResponse.json(
      { error: 'Confirm the classification before choosing details.' },
      { status: 409 }
    );
  }

  try {
    await transaction(async (c) => {
      // Prices are re-fetched here rather than trusted from the browser.
      // The tier follows the classification as it stands right now, which
      // is why a reclassification changes what the event costs.
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
      if (!path) throw new Error('No price tier for this classification');

      await c.query('DELETE FROM request_menu_selections WHERE request_id = $1', [
        requestId,
      ]);

      for (const s of selections) {
        const { rows: priceRows } = await c.query(
          `SELECT unit_price FROM menu_item_prices
            WHERE menu_item_id = $1 AND path = $2
              AND effective_from <= CURRENT_DATE
              AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
            ORDER BY effective_from DESC LIMIT 1`,
          [s.menuItemId, path]
        );
        if (!priceRows[0]) continue;

        await c.query(
          `INSERT INTO request_menu_selections
             (request_id, menu_item_id, quantity, unit_price_quoted, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [requestId, s.menuItemId, s.quantity, priceRows[0].unit_price, s.notes ?? null]
        );
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

      if (confirm) {
        // Details confirmed hands the event back to staff for a final
        // check that the classification still applies, rather than
        // confirming it outright.
        await c.query(
          `UPDATE event_requests
              SET details_confirmed_at = now(), details_confirmed_by = $2,
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
    // Surface the real reason in the server log rather than leaving a
    // bare 500 with nothing to diagnose from.
    console.error('details save failed:', err);
    return NextResponse.json(
      { error: 'Could not save your details. The events office has been notified.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, confirmed: confirm });
}
