import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Cancelling and deleting.
 *
 * Cancel keeps the record and releases the room. Delete removes the
 * request entirely and is restricted to administrators, because the
 * only legitimate use is removing something that should never have
 * been there - and the cost of getting that wrong is a request that
 * cannot be recovered.
 */

const Cancel = z.object({
  action: z.literal('cancel'),
  requestId: z.string().uuid(),
  reason: z.enum([
    'requester_withdrew',
    'date_changed',
    'duplicate_request',
    'no_longer_needed',
    'funding_withdrawn',
    'weather',
    'other',
  ]),
  note: z.string().max(2000).nullable(),
  message: z.string().max(2000).nullable(),
});

const Delete = z.object({
  action: z.literal('delete'),
  requestId: z.string().uuid(),
  // Typed back by the person deleting, to make it deliberate.
  confirmCode: z.string().min(1).max(40),
  reason: z.string().min(1).max(500),
});

const Body = z.discriminatedUnion('action', [Cancel, Delete]);

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

  const request = await one<{
    reference_code: string;
    event_name: string;
    event_date: string;
    requester_name: string;
    department_org: string;
    status: string;
    closed_at: Date | null;
  }>(
    `SELECT reference_code, event_name,
            to_char(event_date,'YYYY-MM-DD') AS event_date,
            requester_name, department_org, status, closed_at
       FROM event_requests WHERE id = $1`,
    [b.requestId]
  );
  if (!request) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  /* ---------- cancel ---------- */
  if (b.action === 'cancel') {
    if (request.closed_at) {
      return NextResponse.json(
        { error: 'This event has already been closed out.' },
        { status: 409 }
      );
    }

    await transaction(async (c) => {
      await c.query(
        `UPDATE event_requests
            SET status = 'cancelled',
                cancellation_reason = $2::cancellation_reason,
                cancellation_note = $3,
                cancelled_at = now(),
                cancelled_by = $4,
                updated_at = now()
          WHERE id = $1`,
        [b.requestId, b.reason, b.note, user!.id]
      );

      await c.query(
        `INSERT INTO request_status_history
           (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'cancelled', $3, $4)`,
        [b.requestId, request.status, user!.id,
         b.note || b.reason.replace(/_/g, ' ')]
      );

      if (b.message?.trim()) {
        await c.query(
          `INSERT INTO request_messages
             (request_id, author_id, body, is_internal, requires_reply)
           VALUES ($1, $2, $3, false, false)`,
          [b.requestId, user!.id, b.message]
        );
      }
    });

    return NextResponse.json({ ok: true });
  }

  /* ---------- delete ---------- */
  if (!user!.roles.includes('admin')) {
    return NextResponse.json(
      {
        error:
          'Only an administrator can delete a request. Cancelling keeps the record and is usually what you want.',
      },
      { status: 403 }
    );
  }

  if (b.confirmCode.trim().toUpperCase() !== request.reference_code.toUpperCase()) {
    return NextResponse.json(
      { error: `Type ${request.reference_code} exactly to confirm.` },
      { status: 400 }
    );
  }

  if (request.closed_at) {
    return NextResponse.json(
      {
        error:
          'This event has been closed out and its figures are in the reporting views. Deleting it would change past reports.',
      },
      { status: 409 }
    );
  }

  try {
    await transaction(async (c) => {
      const { rows } = await c.query(
        `SELECT cd.classification::text
           FROM classification_decisions cd
          WHERE cd.request_id = $1 AND cd.is_current`,
        [b.requestId]
      );

      await c.query(
        `INSERT INTO deleted_requests
           (reference_code, event_name, event_date, requester_name,
            department_org, status_at_deletion, classification,
            reason, deleted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          request.reference_code, request.event_name, request.event_date,
          request.requester_name, request.department_org, request.status,
          rows[0]?.classification ?? null, b.reason, user!.id,
        ]
      );

      // Everything hanging off the request cascades.
      await c.query('DELETE FROM event_requests WHERE id = $1', [b.requestId]);
    });
  } catch (err) {
    console.error('delete failed:', err);
    return NextResponse.json(
      { error: 'Could not delete that request.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deleted: true });
}
