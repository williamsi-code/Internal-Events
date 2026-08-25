import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Adjusting a booking.
 *
 * Event bookings are generated from their request, so this handles the
 * things that genuinely belong to the room rather than the event:
 * setup and teardown buffers, releasing a hold, and blackout blocks
 * that have no request behind them at all.
 */

const Buffers = z.object({
  action: z.literal('buffers'),
  bookingId: z.string().uuid(),
  setupMinutes: z.number().int().min(0).max(1440),
  teardownMinutes: z.number().int().min(0).max(1440),
  note: z.string().max(1000).nullable(),
});

const Release = z.object({
  action: z.literal('release'),
  bookingId: z.string().uuid(),
});

const Blackout = z.object({
  action: z.literal('blackout'),
  spaceId: z.string().uuid(),
  title: z.string().min(1).max(160),
  day: z.string().date(),
  startTime: z.string(),
  endTime: z.string(),
  note: z.string().max(1000).nullable(),
});

const Body = z.discriminatedUnion('action', [Buffers, Release, Blackout]);

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
    if (b.action === 'buffers') {
      // Buffers move the occupied window, which can collide with a
      // confirmed booking. The database constraint will refuse it, and
      // that refusal is the useful answer rather than an error to hide.
      await query(
        `UPDATE bookings
            SET setup_minutes = $2,
                teardown_minutes = $3,
                starts_at = event_starts_at - ($2 || ' minutes')::interval,
                ends_at = event_ends_at + ($3 || ' minutes')::interval,
                note = $4,
                updated_at = now()
          WHERE id = $1`,
        [b.bookingId, b.setupMinutes, b.teardownMinutes, b.note]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'release') {
      await query(
        `UPDATE bookings SET status = 'released', updated_at = now()
          WHERE id = $1`,
        [b.bookingId]
      );
      return NextResponse.json({ ok: true });
    }

    await transaction(async (c) => {
      await c.query(
        `INSERT INTO bookings
           (space_id, starts_at, ends_at, event_starts_at, event_ends_at,
            status, title, note, is_blackout, setup_minutes, teardown_minutes,
            created_by)
         VALUES ($1,
                 ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
                 ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
                 ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
                 ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
                 'confirmed', $5, $6, true, 0, 0, $7)`,
        [b.spaceId, b.day, b.startTime, b.endTime, b.title, b.note, user!.id]
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = String(err);
    if (message.includes('no_confirmed_overlap')) {
      return NextResponse.json(
        {
          error:
            'That would collide with a confirmed booking in the same space. Check the schedule for the times involved.',
        },
        { status: 409 }
      );
    }
    console.error('booking update failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
