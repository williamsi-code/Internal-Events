import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['acknowledge', 'question']),
  body: z.string().max(4000).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Something was missing.' }, { status: 400 });
  }
  const { requestId, action, body } = parsed.data;

  // Ownership check in SQL rather than in application logic: a requester
  // can only ever act on their own request, whatever id they send.
  const owned = await one<{ id: string; status: string }>(
    'SELECT id, status FROM event_requests WHERE id = $1 AND requester_id = $2',
    [requestId, user.id]
  );
  if (!owned) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  if (action === 'acknowledge') {
    const decision = await one<{ id: string }>(
      `SELECT id FROM classification_decisions
        WHERE request_id = $1 AND is_current AND acknowledged_at IS NULL`,
      [requestId]
    );
    if (!decision) {
      return NextResponse.json(
        { error: 'There is nothing waiting for your confirmation.' },
        { status: 409 }
      );
    }

    await transaction(async (c) => {
      await c.query(
        `UPDATE classification_decisions
            SET acknowledged_at = now(), acknowledged_by = $2
          WHERE id = $1`,
        [decision.id, user.id]
      );
      await c.query(
        `UPDATE event_requests
            SET status = 'details_pending', updated_at = now()
          WHERE id = $1`,
        [requestId]
      );
      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'details_pending', $3, 'Requester confirmed the classification')`,
        [requestId, owned.status, user.id]
      );
    });

    return NextResponse.json({ ok: true });
  }

  // A question hands the request back to staff. Whether it was awaiting
  // the requester or awaiting acknowledgement, it is now their move.
  if (!body || !body.trim()) {
    return NextResponse.json({ error: 'Write your question first.' }, { status: 400 });
  }

  await transaction(async (c) => {
    await c.query(
      `INSERT INTO request_messages
         (request_id, author_id, body, is_internal, requires_reply)
       VALUES ($1, $2, $3, false, true)`,
      [requestId, user.id, body]
    );
    await c.query(
      `UPDATE request_messages
          SET read_at = now()
        WHERE request_id = $1 AND author_id <> $2 AND read_at IS NULL`,
      [requestId, user.id]
    );
    await c.query(
      `UPDATE event_requests
          SET status = 'under_review', updated_at = now()
        WHERE id = $1`,
      [requestId]
    );
    await c.query(
      `INSERT INTO request_status_history
         (request_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'under_review', $3, 'Requester replied')`,
      [requestId, owned.status, user.id]
    );
  });

  return NextResponse.json({ ok: true });
}