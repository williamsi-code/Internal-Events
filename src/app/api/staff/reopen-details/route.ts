import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Reopening details for a change.
 *
 * Staff-initiated on purpose. A requester who wants a change sends a
 * message; staff decide whether reopening is the right answer or
 * whether it is late enough that a conversation should happen first.
 *
 * The room is not released: the event is still happening, only the
 * order is in question.
 */

const Body = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
  message: z.string().max(2000).nullable(),
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
    return NextResponse.json(
      { error: 'Say why the details are being reopened.' },
      { status: 400 }
    );
  }
  const { requestId, reason, message } = parsed.data;

  const request = await one<{
    status: string;
    details_confirmed_at: Date | null;
    closed_at: Date | null;
  }>(
    `SELECT status, details_confirmed_at, closed_at
       FROM event_requests WHERE id = $1`,
    [requestId]
  );

  if (!request) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }
  if (request.closed_at) {
    return NextResponse.json(
      { error: 'This event has been closed out. Its figures are final.' },
      { status: 409 }
    );
  }
  if (!request.details_confirmed_at) {
    return NextResponse.json(
      { error: 'These details are not confirmed, so there is nothing to reopen.' },
      { status: 409 }
    );
  }

  try {
    await transaction(async (c) => {
      // Clearing details_confirmed_at is what unlocks the requester's
      // menu. The snapshot trigger captures the current order first.
      await c.query(
        `UPDATE event_requests
            SET details_reopened_at = now(),
                details_reopened_by = $2,
                details_reopen_count = details_reopen_count + 1,
                details_confirmed_at = NULL,
                details_confirmed_by = NULL,
                status = 'details_pending',
                updated_at = now()
          WHERE id = $1`,
        [requestId, user!.id]
      );

      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'details_pending', $3, $4)`,
        [requestId, request.status, user!.id, `Details reopened: ${reason}`]
      );

      await c.query(
        `INSERT INTO request_messages
           (request_id, author_id, body, is_internal, requires_reply)
         VALUES ($1, $2, $3, false, true)`,
        [
          requestId,
          user!.id,
          message?.trim() ||
            `We have reopened your menu and setup details so you can make a change. ${reason}`,
        ]
      );
    });
  } catch (err) {
    console.error('reopen failed:', err);
    return NextResponse.json(
      { error: 'Could not reopen the details.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
