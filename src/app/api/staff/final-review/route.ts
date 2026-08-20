import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['confirm', 'reclassify']),
  note: z.string().max(2000).optional(),
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
    return NextResponse.json({ error: 'Something was missing.' }, { status: 400 });
  }
  const { requestId, action, note } = parsed.data;

  const current = await one<{ status: string }>(
    'SELECT status FROM event_requests WHERE id = $1',
    [requestId]
  );
  if (!current) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  try {
    await transaction(async (c) => {
      if (action === 'confirm') {
        await c.query(
          `UPDATE event_requests
              SET status = 'confirmed',
                  final_reviewed_at = now(), final_reviewed_by = $2,
                  updated_at = now()
            WHERE id = $1`,
          [requestId, user!.id]
        );
        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'confirmed', $3, $4)`,
          [
            requestId,
            current.status,
            user!.id,
            note || 'Classification still applies. Event confirmed.',
          ]
        );
        if (note) {
          await c.query(
            `INSERT INTO request_messages
               (request_id, author_id, body, is_internal, requires_reply)
             VALUES ($1, $2, $3, false, false)`,
            [requestId, user!.id, note]
          );
        }
      } else {
        // Sending it back for reclassification clears the requester's
        // acknowledgement by superseding the decision, so they are asked
        // again once the new classification is recorded.
        await c.query(
          `UPDATE event_requests
              SET status = 'under_review', updated_at = now()
            WHERE id = $1`,
          [requestId]
        );
        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'under_review', $3, $4)`,
          [
            requestId,
            current.status,
            user!.id,
            note || 'Sent back for reclassification after details changed.',
          ]
        );
      }
    });
  } catch (err) {
    console.error('final review failed:', err);
    return NextResponse.json(
      { error: 'Could not record that.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
