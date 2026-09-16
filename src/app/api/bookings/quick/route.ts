import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Booking a meeting room in one step.
 *
 * A room-only booking, with no event request behind it. Staff
 * bookings confirm immediately; anyone else's arrive as a request
 * the events office confirms, because a room being free is not the
 * same as it being available.
 */

const Check = z.object({
  action: z.literal('check'),
  spaceId: z.string().uuid(),
  date: z.string().date(),
  startTime: z.string(),
  endTime: z.string(),
});

const Book = Check.omit({ action: true }).extend({
  action: z.literal('book'),
  title: z.string().min(1).max(200),
  purpose: z.string().max(1000).nullable(),
  attendance: z.number().int().positive().max(5000).nullable(),
});

const Decide = z.object({
  action: z.literal('decide'),
  bookingId: z.string().uuid(),
  confirm: z.boolean(),
  note: z.string().max(1000).nullable(),
});

const Cancel = z.object({
  action: z.literal('cancel'),
  bookingId: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [Check, Book, Decide, Cancel]);

interface CheckResult {
  ok: boolean;
  problem: string | null;
  clash_title: string | null;
  closure_reason: string | null;
  notice_hours: string | null;
  space_name: string | null;
  supports_catering: boolean | null;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to book a room.' },
      { status: 401 }
    );
  }

  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the details.' }, { status: 400 });
  }
  const b = parsed.data;

  try {
    if (b.action === 'check') {
      const result = await one<CheckResult>(
        'SELECT * FROM quick_booking_check($1, $2, $3, $4)',
        [b.spaceId, b.date, b.startTime, b.endTime]
      );
      return NextResponse.json(result ?? { ok: false });
    }

    if (b.action === 'book') {
      // Checked here rather than trusted from the form: the slot may
      // have gone while they were typing.
      const check = await one<CheckResult>(
        'SELECT * FROM quick_booking_check($1, $2, $3, $4)',
        [b.spaceId, b.date, b.startTime, b.endTime]
      );

      if (!check?.ok) {
        return NextResponse.json(
          {
            error:
              check?.problem ??
              'That room cannot be booked for that time.',
            clash: check?.clash_title ?? null,
          },
          { status: 409 }
        );
      }

      const row = await one<{ id: string }>(
        `INSERT INTO bookings (
           space_id, starts_at, ends_at, event_starts_at, event_ends_at,
           status, title, note, is_blackout,
           setup_minutes, teardown_minutes,
           is_quick_booking, requested_by, quick_state,
           quick_purpose, quick_attendance, created_by
         ) VALUES (
           $1,
           ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
           ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
           ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
           ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
           $5, $6, $7, false, 0, 0,
           true, $8, $9, $10, $11, $8
         )
         RETURNING id`,
        [
          b.spaceId, b.date, b.startTime, b.endTime,
          // Staff booking a room have already made the decision.
          isStaff ? 'confirmed' : 'tentative',
          b.title,
          b.purpose,
          user.id,
          isStaff ? 'confirmed' : 'requested',
          b.purpose,
          b.attendance,
        ]
      );

      return NextResponse.json({
        ok: true,
        bookingId: row?.id,
        confirmed: isStaff,
        // Worth saying, since the room being free is the only thing
        // this checks.
        supportsCatering: check.supports_catering,
      });
    }

    if (b.action === 'decide') {
      if (!isStaff) {
        return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
      }

      await query(
        `UPDATE bookings
            SET quick_state = $2::quick_booking_state,
                status = $3::booking_status,
                decided_by = $4,
                decided_at = now(),
                decision_note = $5
          WHERE id = $1 AND is_quick_booking`,
        [
          b.bookingId,
          b.confirm ? 'confirmed' : 'refused',
          b.confirm ? 'confirmed' : 'released',
          user.id,
          b.note,
        ]
      );

      // Telling them is the point. Someone who asked for a room and
      // heard nothing will ring up to check, which costs more time
      // than the booking saved.
      const decided = await one<{
        email: string;
        title: string;
        space_name: string;
        when: string;
      }>(
        `SELECT u.email::text, b.title, s.name AS space_name,
                to_char(b.event_starts_at AT TIME ZONE 'America/Chicago',
                        'FMDay FMDD FMMonth, FMHH12:MI AM') AS when
           FROM bookings b
           JOIN spaces s ON s.id = b.space_id
           LEFT JOIN users u ON u.id = b.requested_by
          WHERE b.id = $1`,
        [b.bookingId]
      );

      if (decided?.email && process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Events & Conferences <noreply@central.edu>',
            to: decided.email,
            subject: b.confirm
              ? `${decided.space_name} is booked for you`
              : `We cannot give you ${decided.space_name}`,
            text: b.confirm
              ? `${decided.title}\n${decided.space_name}, ${decided.when}\n\nThe room is yours. It is on the campus schedule.\n`
              : `${decided.title}\n${decided.space_name}, ${decided.when}\n\n${
                  b.note ??
                  'We are not able to give you that room at that time.'
                }\n`,
          }),
        }).catch(() => {});
      }

      return NextResponse.json({ ok: true });
    }

    // Cancelling: the person who asked, or staff.
    const booking = await one<{ requested_by: string | null }>(
      'SELECT requested_by FROM bookings WHERE id = $1 AND is_quick_booking',
      [b.bookingId]
    );

    if (!booking) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }
    if (!isStaff && booking.requested_by !== user.id) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    await query(
      `UPDATE bookings SET status = 'released', quick_state = 'refused'
        WHERE id = $1`,
      [b.bookingId]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('quick booking failed:', err);
    return NextResponse.json(
      { error: 'Could not book that room.' },
      { status: 500 }
    );
  }
}
