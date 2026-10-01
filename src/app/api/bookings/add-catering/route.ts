import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Turning a room booking into an event.
 *
 * Available to the person who booked the room and to staff. The
 * booking is kept, so the room is never released and re-taken - a
 * gap of even a second is a gap somebody else could book into.
 */

const Body = z.object({
  bookingId: z.string().uuid(),
  eventName: z.string().max(200).nullable(),
  description: z.string().max(4000).nullable(),
  attendance: z.number().int().positive().max(20_000).nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the details.' }, { status: 400 });
  }
  const b = parsed.data;

  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');

  const booking = await one<{ requested_by: string | null }>(
    'SELECT requested_by FROM bookings_without_events WHERE booking_id = $1',
    [b.bookingId]
  );

  if (!booking) {
    return NextResponse.json(
      { error: 'That booking cannot be turned into an event.' },
      { status: 404 }
    );
  }

  if (!isStaff && booking.requested_by !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  try {
    const row = await one<{ id: string }>(
      'SELECT room_booking_to_event($1, $2, $3, $4, $5) AS id',
      [
        b.bookingId, user.id, b.eventName, b.description, b.attendance,
      ]
    );
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (err) {
    console.error('booking conversion failed:', err);
    return NextResponse.json(
      { error: 'Could not turn that into an event.' },
      { status: 500 }
    );
  }
}
