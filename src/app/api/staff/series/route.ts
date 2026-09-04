import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { previewSeries } from '@/lib/scheduler-extras';

/**
 * Recurring bookings and taking a room out of service.
 *
 * A series is previewed before it is committed, because the failure
 * mode is thirty wrong bookings rather than one, and because the
 * useful information is which dates already have something in them.
 */

const Preview = z.object({
  action: z.literal('preview'),
  spaceId: z.string().uuid(),
  kind: z.enum(['weekly', 'fortnightly', 'monthly_date', 'monthly_weekday']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  startTime: z.string(),
  endTime: z.string(),
});

const CreateSeries = Preview.omit({ action: true }).extend({
  action: z.literal('createSeries'),
  title: z.string().min(1).max(200),
  note: z.string().max(1000).nullable(),
  setupMinutes: z.number().int().min(0).max(1440),
  teardownMinutes: z.number().int().min(0).max(1440),
  skipClashes: z.boolean(),
});

const DeleteSeries = z.object({
  action: z.literal('deleteSeries'),
  seriesId: z.string().uuid(),
  futureOnly: z.boolean(),
});

const CreateClosure = z.object({
  action: z.literal('createClosure'),
  spaceId: z.string().uuid(),
  kind: z.enum(['maintenance', 'renovation', 'seasonal', 'reserved', 'other']),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  reason: z.string().min(1).max(500),
  blocksBooking: z.boolean(),
});

const DeleteClosure = z.object({
  action: z.literal('deleteClosure'),
  closureId: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [
  Preview,
  CreateSeries,
  DeleteSeries,
  CreateClosure,
  DeleteClosure,
]);

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
    if (b.action === 'preview') {
      const dates = await previewSeries(b);
      return NextResponse.json({ dates });
    }

    if (b.action === 'createSeries') {
      const dates = await previewSeries(b);
      const usable = dates.filter((d) => {
        if (d.closed) return false;
        if (b.skipClashes && d.clash) return false;
        return true;
      });

      if (usable.length === 0) {
        return NextResponse.json(
          { error: 'Every date in that pattern is blocked or already booked.' },
          { status: 409 }
        );
      }

      const seriesId = await transaction(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO booking_series
             (space_id, title, note, kind, weekdays, starts_on, ends_on,
              start_time, end_time, setup_minutes, teardown_minutes,
              created_by)
           VALUES ($1,$2,$3,$4::recurrence_kind,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [
            b.spaceId, b.title, b.note, b.kind, b.weekdays,
            b.startsOn, b.endsOn, b.startTime, b.endTime,
            b.setupMinutes, b.teardownMinutes, user!.id,
          ]
        );
        const id = rows[0].id;

        let index = 0;
        for (const d of usable) {
          await c.query(
            `INSERT INTO bookings (
               space_id, starts_at, ends_at, event_starts_at, event_ends_at,
               status, title, note, is_blackout,
               setup_minutes, teardown_minutes,
               series_id, series_index, created_by
             ) VALUES (
               $1,
               ($2::date + $3::time) AT TIME ZONE 'America/Chicago'
                 - ($8 || ' minutes')::interval,
               ($2::date + $4::time) AT TIME ZONE 'America/Chicago'
                 + ($9 || ' minutes')::interval,
               ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
               ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
               'tentative', $5, $6, false, $8, $9, $7, $10, $11
             )`,
            [
              b.spaceId, d.date, b.startTime, b.endTime,
              b.title, b.note, id,
              b.setupMinutes, b.teardownMinutes, index++, user!.id,
            ]
          );
        }

        return id;
      });

      return NextResponse.json({
        ok: true,
        seriesId,
        created: usable.length,
        skipped: dates.length - usable.length,
      });
    }

    if (b.action === 'deleteSeries') {
      if (b.futureOnly) {
        await query(
          `DELETE FROM bookings
            WHERE series_id = $1 AND starts_at > now()`,
          [b.seriesId]
        );
      } else {
        await query('DELETE FROM booking_series WHERE id = $1', [b.seriesId]);
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'createClosure') {
      // Warn rather than refuse: staff may be closing a room precisely
      // because those events are moving, and refusing would leave them
      // unable to record it.
      const affected = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM bookings b
          WHERE b.space_id = $1
            AND NOT b.is_blackout
            AND b.status <> 'released'
            AND (b.starts_at AT TIME ZONE 'America/Chicago')::date
                BETWEEN $2::date AND $3::date`,
        [b.spaceId, b.startsOn, b.endsOn]
      );

      await query(
        `INSERT INTO space_closures
           (space_id, kind, starts_on, ends_on, reason, blocks_booking, created_by)
         VALUES ($1,$2::closure_kind,$3,$4,$5,$6,$7)`,
        [
          b.spaceId, b.kind, b.startsOn, b.endsOn,
          b.reason, b.blocksBooking, user!.id,
        ]
      );

      return NextResponse.json({
        ok: true,
        affected: Number(affected?.n ?? 0),
      });
    }

    await query('DELETE FROM space_closures WHERE id = $1', [b.closureId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('series action failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
