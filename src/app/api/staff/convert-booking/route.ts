import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Turning a room booking into a catered event.
 *
 * The request is created in submitted state with the classification
 * answers marked unknown, because that is the truth: nobody asked
 * them when the room was booked. Staff either answer them on the
 * requester's behalf or send the requester the link to do it.
 */

const Body = z.object({
  bookingId: z.string().uuid(),
  requesterEmail: z.string().email().max(200),
  requesterName: z.string().min(1).max(200),
  department: z.string().min(1).max(200),
  phone: z.string().max(50).nullable(),
  attendance: z.number().int().positive().max(20_000),
  purpose: z.string().max(4000).nullable(),
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
      { error: 'Check the details and try again.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  // If the customer already has an account the event belongs to them
  // and appears in their own list. If not, it belongs to the member of
  // staff doing the conversion until the customer signs up - which is
  // honest about who can currently act on it.
  const existing = await one<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND is_active',
    [b.requesterEmail]
  );

  const ownerId = existing?.id ?? user!.id;

  try {
    const row = await one<{ convert_booking_to_event: string }>(
      `SELECT convert_booking_to_event(
         $1, $2, $3, $4, $5, $6, $7, $8, $9
       )`,
      [
        b.bookingId,
        ownerId,
        b.requesterName,
        b.department,
        b.requesterEmail,
        b.phone,
        b.attendance,
        b.purpose,
        user!.id,
      ]
    );

    const requestId = row?.convert_booking_to_event;

    // Tell them it exists, if they can actually see it.
    if (existing && requestId) {
      await query(
        `INSERT INTO request_messages
           (request_id, author_id, body, is_internal, requires_reply)
         VALUES ($1, $2, $3, false, true)`,
        [
          requestId,
          user!.id,
          'We have turned your room booking into a catering request. A few questions still need answering before we can price it, so please open this request and check the details.',
        ]
      );
    }

    return NextResponse.json({
      ok: true,
      requestId,
      ownedByRequester: !!existing,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('cannot be converted')
        ? 'That booking already has an event behind it.'
        : 'Could not convert that booking.';
    console.error('booking conversion failed:', err);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
