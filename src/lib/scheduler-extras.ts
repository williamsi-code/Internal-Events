import { query, one } from './db';

/**
 * Recurring bookings and rooms out of service.
 *
 * Occurrences are generated as real rows rather than computed on the
 * fly, so the overlap constraint, the conflict view and the resource
 * grid all work without knowing recurrence exists.
 */

export interface SeriesPreviewRow {
  date: string;
  weekday: string;
  clash: string | null;
  closed: string | null;
}

/** What a pattern would produce, and what is already in the way.
 *  Nothing is written until someone has seen this. */
export async function previewSeries(params: {
  spaceId: string;
  kind: string;
  weekdays: number[];
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
}) {
  return query<SeriesPreviewRow>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS date,
            to_char(d, 'Dy') AS weekday,
            (SELECT b.title FROM bookings b
              WHERE b.space_id = $1
                AND b.status <> 'released'
                AND tstzrange(b.starts_at, b.ends_at) && tstzrange(
                      (d + $6::time) AT TIME ZONE 'America/Chicago',
                      (d + $7::time) AT TIME ZONE 'America/Chicago')
              LIMIT 1) AS clash,
            (SELECT reason FROM space_closed_on($1, d::date)) AS closed
       FROM series_dates($2::recurrence_kind, $3::int[], $4::date, $5::date) d
      ORDER BY d`,
    [
      params.spaceId,
      params.kind,
      params.weekdays,
      params.startsOn,
      params.endsOn,
      params.startTime,
      params.endTime,
    ]
  );
}

export interface Series {
  id: string;
  space_id: string;
  space_name: string;
  building: string | null;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  start_time: string;
  end_time: string;
  status: string;
  occurrences: number;
  next_date: string | null;
  created_by_name: string | null;
}

export async function listSeries() {
  return query<Series>(
    `SELECT bs.id, bs.space_id, s.name AS space_name, s.building,
            bs.title, bs.kind::text,
            to_char(bs.starts_on, 'Mon FMDD, YYYY') AS starts_on,
            to_char(bs.ends_on, 'Mon FMDD, YYYY') AS ends_on,
            to_char(bs.start_time, 'FMHH12:MI AM') AS start_time,
            to_char(bs.end_time, 'FMHH12:MI AM') AS end_time,
            bs.status::text,
            (SELECT count(*) FROM bookings b WHERE b.series_id = bs.id)
              AS occurrences,
            (SELECT to_char(min(b.starts_at) AT TIME ZONE 'America/Chicago',
                            'Mon FMDD')
               FROM bookings b
              WHERE b.series_id = bs.id
                AND b.starts_at > now()) AS next_date,
            u.full_name AS created_by_name
       FROM booking_series bs
       JOIN spaces s ON s.id = bs.space_id
       LEFT JOIN users u ON u.id = bs.created_by
      WHERE bs.ends_on >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY bs.starts_on DESC`
  );
}

export interface Closure {
  id: string;
  space_id: string;
  space_name: string;
  building: string | null;
  kind: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  blocks_booking: boolean;
  active_now: boolean;
  events_affected: number;
}

export async function listClosures() {
  return query<Closure>(
    `SELECT id, space_id, space_name, building, kind::text,
            to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
            to_char(ends_on, 'YYYY-MM-DD') AS ends_on,
            reason, blocks_booking, active_now, events_affected
       FROM spaces_out_of_service`
  );
}

/** Rooms unavailable on a date, for warning at booking time. */
export async function closedSpacesOn(date: string) {
  return query<{ space_id: string; reason: string; blocks: boolean }>(
    `SELECT space_id, reason, blocks_booking AS blocks
       FROM space_closures
      WHERE $1::date BETWEEN starts_on AND ends_on`,
    [date]
  );
}
