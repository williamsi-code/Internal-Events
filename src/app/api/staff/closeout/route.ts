import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  didNotOccur: z.boolean(),
  actualAttendance: z.number().int().min(0).max(20_000).nullable(),
  costs: z.object({
    food: z.number().min(0).max(1_000_000),
    consumables: z.number().min(0).max(1_000_000),
    labor: z.number().min(0).max(1_000_000),
    other_direct: z.number().min(0).max(1_000_000),
  }),
  laborHours: z.number().min(0).max(10_000).nullable(),
  notes: z.string().max(4000).nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the figures.' }, { status: 400 });
  }
  const b = parsed.data;

  const request = await one<{ event_date: string }>(
    `SELECT to_char(event_date, 'YYYY-MM-DD') AS event_date
       FROM event_requests WHERE id = $1`,
    [b.requestId]
  );
  if (!request) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  try {
    await transaction(async (c) => {
      // Costs replace rather than accumulate, so re-opening a close-out
      // and correcting a figure does not double it.
      for (const [category, amount] of Object.entries(b.costs)) {
        if (amount <= 0) {
          await c.query(
            `DELETE FROM event_costs
              WHERE request_id = $1 AND category = $2::cost_category
                AND is_actual`,
            [b.requestId, category]
          );
          continue;
        }
        await c.query(
          `INSERT INTO event_costs
             (request_id, category, amount, is_actual, recorded_by)
           VALUES ($1, $2::cost_category, $3, true, $4)
           ON CONFLICT (request_id, category, is_actual)
           DO UPDATE SET amount = EXCLUDED.amount,
                         recorded_by = EXCLUDED.recorded_by,
                         recorded_at = now()`,
          [b.requestId, category, amount, user!.id]
        );
      }

      await c.query('DELETE FROM labor_entries WHERE request_id = $1', [
        b.requestId,
      ]);
      if (b.laborHours && b.laborHours > 0) {
        await c.query(
          `INSERT INTO labor_entries
             (request_id, period_start, kind, hours, cost, recorded_by)
           VALUES ($1, $2::date, 'variable_event', $3, $4, $5)`,
          [b.requestId, request.event_date, b.laborHours, b.costs.labor, user!.id]
        );
      }

      await c.query(
        `UPDATE event_requests
            SET actual_attendance = $2,
                did_not_occur = $3,
                closeout_notes = $4,
                closed_at = now(),
                closed_by = $5,
                updated_at = now()
          WHERE id = $1`,
        [
          b.requestId,
          b.didNotOccur ? 0 : b.actualAttendance,
          b.didNotOccur,
          b.notes,
          user!.id,
        ]
      );

      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, 'confirmed', $2, $3, 'Event closed out')`,
        [b.requestId, b.didNotOccur ? 'cancelled' : 'completed', user!.id]
      );
    });
  } catch (err) {
    console.error('closeout failed:', err);
    return NextResponse.json({ error: 'Could not close this out.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
