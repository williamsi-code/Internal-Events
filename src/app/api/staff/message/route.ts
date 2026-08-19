import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  isInternal: z.boolean(),
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
    return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  }
  const { requestId, body, isInternal } = parsed.data;

  await transaction(async (c) => {
    await c.query(
      `INSERT INTO request_messages
         (request_id, author_id, body, is_internal, requires_reply)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, user!.id, body, isInternal, !isInternal]
    );

    // A question to the requester moves the request to 'awaiting requester'.
    // This keeps the queue honest about what is blocked on staff versus
    // blocked on someone else. Internal notes do not stop the clock.
    if (!isInternal) {
      const { rows: before } = await c.query(
        `SELECT status FROM event_requests WHERE id = $1`,
        [requestId]
      );

      await c.query(
        `UPDATE event_requests SET status = 'info_requested', updated_at = now()
          WHERE id = $1`,
        [requestId]
      );

      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'info_requested', $3, 'Question sent to requester')`,
        [requestId, before[0]?.status ?? null, user!.id]
      );
    }
  });

  return NextResponse.json({ ok: true });
}