import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Answering an offered alternative.
 *
 * The requester's answer, not staff's. Accepting moves the event to
 * what was offered; declining sends it back with a reason so staff
 * know whether to try again or stop.
 */

const Body = z.object({
  requestId: z.string().uuid(),
  accept: z.boolean(),
  note: z.string().max(2000).nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const { requestId, accept, note } = parsed.data;

  // Only the person whose event it is can answer. Checked in SQL
  // rather than trusted from the request.
  const owned = await one<{ id: string; status: string }>(
    'SELECT id, status FROM event_requests WHERE id = $1 AND requester_id = $2',
    [requestId, user.id]
  );
  if (!owned) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  const offer = await one<{ id: string; response: string | null }>(
    `SELECT id, alternative_response::text AS response
       FROM capacity_checks
      WHERE request_id = $1 AND outcome = 'alternative_offered'
      ORDER BY checked_at DESC LIMIT 1`,
    [requestId]
  );

  if (!offer) {
    return NextResponse.json(
      { error: 'There is no alternative to answer.' },
      { status: 409 }
    );
  }
  if (offer.response) {
    return NextResponse.json(
      { error: 'You have already answered this.' },
      { status: 409 }
    );
  }

  try {
    await transaction(async (c) => {
      if (accept) {
        await c.query('SELECT accept_alternative($1, $2)', [requestId, user.id]);

        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'classified', $3, 'Requester accepted the alternative')`,
          [requestId, owned.status, user.id]
        );
      } else {
        await c.query(
          `UPDATE capacity_checks
              SET alternative_response = 'declined',
                  responded_at = now(),
                  response_note = $2
            WHERE id = $1`,
          [offer.id, note]
        );

        // Back to staff. The event is not dead - they may have another
        // room, another date, or a reason to reconsider.
        await c.query(
          `UPDATE event_requests
              SET status = 'under_review', updated_at = now()
            WHERE id = $1`,
          [requestId]
        );

        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'under_review', $3, 'Requester declined the alternative')`,
          [requestId, owned.status, user.id]
        );
      }

      await c.query(
        `INSERT INTO request_messages
           (request_id, author_id, body, is_internal, requires_reply)
         VALUES ($1, $2, $3, false, $4)`,
        [
          requestId,
          user.id,
          accept
            ? note?.trim() || 'That alternative works for us, thank you.'
            : note?.trim() ||
              'That alternative does not work for us. Is there anything else possible?',
          !accept,
        ]
      );
    });
  } catch (err) {
    console.error('alternative response failed:', err);
    return NextResponse.json(
      { error: 'Could not record your answer.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
