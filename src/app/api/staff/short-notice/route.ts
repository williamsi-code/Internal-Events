import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Approving or refusing a short-notice request.
 *
 * This is the first decision on such an event and it gates everything
 * else. Approving does not commit to the event - it says the request
 * may proceed to be classified and checked like any other.
 */

const Body = z.object({
  requestId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(2000).nullable(),
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
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const { requestId, approve, note } = parsed.data;

  try {
    await transaction(async (c) => {
      if (approve) {
        await c.query(
          `UPDATE event_requests
              SET short_notice_state = 'approved',
                  short_notice_decided_at = now(),
                  short_notice_decided_by = $2,
                  short_notice_note = $3,
                  updated_at = now()
            WHERE id = $1`,
          [requestId, user!.id, note]
        );
      } else {
        await c.query('SELECT decline_short_notice($1, $2, $3)', [
          requestId,
          user!.id,
          note,
        ]);
      }

      await c.query(
        `INSERT INTO request_messages
           (request_id, author_id, body, is_internal, requires_reply)
         VALUES ($1, $2, $3, false, false)`,
        [
          requestId,
          user!.id,
          note?.trim() ||
            (approve
              ? 'We can take this on at short notice. Your request is now being classified like any other, and we will be in touch shortly.'
              : 'We are not able to take this on at the notice given. Please get in touch if you can move the date, and we will do what we can.'),
        ]
      );
    });
  } catch (err) {
    console.error('short notice decision failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
