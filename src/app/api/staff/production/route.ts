import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * The catering plan.
 *
 * Planning generates tasks from the menu; everything else is a
 * person moving or finishing one of them.
 */

const Plan = z.object({
  action: z.literal('plan'),
  requestId: z.string().uuid(),
  includeService: z.boolean(),
});

const Move = z.object({
  action: z.literal('move'),
  taskId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  stationId: z.string().uuid().nullable(),
});

const SetState = z.object({
  action: z.literal('state'),
  taskId: z.string().uuid(),
  state: z.enum(['planned', 'in_progress', 'done', 'cancelled']),
});

const Assign = z.object({
  action: z.literal('assign'),
  taskId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});

const AddTask = z.object({
  action: z.literal('add'),
  requestId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  stationId: z.string().uuid().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  note: z.string().max(1000).nullable(),
});

const Remove = z.object({
  action: z.literal('remove'),
  taskId: z.string().uuid(),
});

const MoveWindow = z.object({
  action: z.literal('window'),
  windowId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  staffCount: z.number().int().min(0).max(100),
});

const Body = z.discriminatedUnion('action', [
  Plan, Move, SetState, Assign, AddTask, Remove, MoveWindow,
]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const b = parsed.data;

  try {
    if (b.action === 'plan') {
      if (b.includeService) {
        await query('SELECT plan_service_windows($1)', [b.requestId]);
      }
      const result = await one<{ n: number }>(
        'SELECT plan_production($1, $2) AS n',
        [b.requestId, user!.id]
      );
      return NextResponse.json({ ok: true, tasks: result?.n ?? 0 });
    }

    if (b.action === 'move') {
      await query(
        `UPDATE production_tasks
            SET starts_at = $2::timestamptz, ends_at = $3::timestamptz,
                station_id = coalesce($4, station_id)
          WHERE id = $1`,
        [b.taskId, b.startsAt, b.endsAt, b.stationId]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'state') {
      await query(
        `UPDATE production_tasks
            SET state = $2::production_state,
                started_at = CASE
                  WHEN $2 = 'in_progress' AND started_at IS NULL
                  THEN now() ELSE started_at END,
                completed_at = CASE
                  WHEN $2 = 'done' THEN now() ELSE NULL END,
                completed_by = CASE
                  WHEN $2 = 'done' THEN $3 ELSE NULL END
          WHERE id = $1`,
        [b.taskId, b.state, user!.id]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'assign') {
      await query(
        'UPDATE production_tasks SET assigned_to = $2 WHERE id = $1',
        [b.taskId, b.userId]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'add') {
      const row = await one<{ id: string }>(
        `INSERT INTO production_tasks
           (request_id, title, station_id, starts_at, ends_at, note)
         VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6)
         RETURNING id`,
        [b.requestId, b.title, b.stationId, b.startsAt, b.endsAt, b.note]
      );
      return NextResponse.json({ ok: true, id: row?.id });
    }

    if (b.action === 'remove') {
      await query(
        `UPDATE production_tasks SET state = 'cancelled' WHERE id = $1`,
        [b.taskId]
      );
      return NextResponse.json({ ok: true });
    }

    await query(
      `UPDATE service_windows
          SET starts_at = $2::timestamptz, ends_at = $3::timestamptz,
              staff_count = $4
        WHERE id = $1`,
      [b.windowId, b.startsAt, b.endsAt, b.staffCount]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('production failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
