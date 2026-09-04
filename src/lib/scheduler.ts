import { query, one } from './db';
import type { Classification } from './classify';

/**
 * The room scheduler, scoped to catering and events.
 *
 * Bookings are generated from requests rather than entered by hand:
 * acknowledging a classification puts an event on the schedule
 * tentatively, and final review turns it solid.
 *
 * Times come back as minutes from midnight as well as formatted
 * strings, because the day view positions blocks on a timeline and
 * parsing a formatted string back into a number is a good way to
 * introduce a timezone bug.
 */

export interface Booking {
  id: string;
  request_id: string | null;
  reference_code: string | null;
  space_id: string;
  space_name: string;
  building: string | null;
  title: string;
  note: string | null;
  status: 'tentative' | 'confirmed' | 'released';
  is_blackout: boolean;
  day: string;
  end_day: string;
  starts_at: string;
  ends_at: string;
  event_starts: string | null;
  event_ends: string | null;
  start_minutes: number;
  end_minutes: number;
  setup_minutes: number;
  teardown_minutes: number;
  attendance: number | null;
  classification: Classification | null;
  has_conflict: boolean;
}

export async function listBookings(fromDate: string, toDate: string) {
  return query<Booking>(
    `SELECT b.id, b.request_id, r.reference_code,
            b.space_id, s.name AS space_name, s.building,
            b.title, b.note, b.status, b.is_blackout,
            to_char(b.starts_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS day,
            to_char(b.ends_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS end_day,
            to_char(b.starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS starts_at,
            to_char(b.ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS ends_at,
            to_char(b.event_starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS event_starts,
            to_char(b.event_ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS event_ends,
            (extract(hour from b.starts_at AT TIME ZONE 'America/Chicago') * 60
             + extract(minute from b.starts_at AT TIME ZONE 'America/Chicago'))::int
              AS start_minutes,
            (extract(hour from b.ends_at AT TIME ZONE 'America/Chicago') * 60
             + extract(minute from b.ends_at AT TIME ZONE 'America/Chicago'))::int
              AS end_minutes,
            b.setup_minutes, b.teardown_minutes,
            coalesce(r.final_attendance, r.estimated_attendance) AS attendance,
            cd.classification,
            EXISTS (
              SELECT 1 FROM bookings o
               WHERE o.space_id = b.space_id
                 AND o.id <> b.id
                 AND o.status <> 'released'
                 AND tstzrange(o.starts_at, o.ends_at)
                     && tstzrange(b.starts_at, b.ends_at)
            ) AS has_conflict
       FROM bookings b
       JOIN spaces s ON s.id = b.space_id
       LEFT JOIN event_requests r ON r.id = b.request_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
      WHERE b.status <> 'released'
        AND (b.starts_at AT TIME ZONE 'America/Chicago')::date <= $2::date
        AND (b.ends_at AT TIME ZONE 'America/Chicago')::date >= $1::date
      ORDER BY b.starts_at`,
    [fromDate, toDate]
  );
}

export interface SpaceRow {
  id: string;
  name: string;
  building: string | null;
  category: string | null;
  capacity_seated: number | null;
}

/** Meeting venues first, because that is what the events office
 *  spends its day in. The rest are available from the filter. */
export async function listSchedulableSpaces() {
  return query<SpaceRow>(
    `SELECT id, name, building, category, capacity_seated
       FROM spaces
      WHERE is_active
      ORDER BY
        CASE category
          WHEN 'Meeting Venues' THEN 0
          WHEN 'Outside Spaces' THEN 1
          WHEN 'Academic'       THEN 2
          WHEN 'Athletics'      THEN 3
          WHEN 'Housing'        THEN 4
          ELSE 5
        END,
        building, sort_order, name`
  );
}

export interface ConflictRow {
  booking_id: string;
  request_id: string | null;
  title: string;
  status: string;
  space_name: string;
  other_title: string;
  other_status: string;
  day: string;
  window: string;
}

export async function listConflicts() {
  return query<ConflictRow>(
    `SELECT DISTINCT ON (least(booking_id, other_booking_id),
                         greatest(booking_id, other_booking_id))
            booking_id, request_id, title, status, space_name,
            other_title, other_status,
            to_char(starts_at AT TIME ZONE 'America/Chicago', 'Mon FMDD') AS day,
            to_char(starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
              || ' - ' ||
            to_char(ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS window
       FROM booking_conflicts
      ORDER BY least(booking_id, other_booking_id),
               greatest(booking_id, other_booking_id),
               starts_at`
  );
}

/** Which days in a range have anything on them, so the date picker
 *  can show where the activity is rather than being a blank grid. */
export async function getBusyDays(fromDate: string, toDate: string) {
  return query<{ day: string; n: number }>(
    `SELECT to_char((b.starts_at AT TIME ZONE 'America/Chicago')::date,
                    'YYYY-MM-DD') AS day,
            count(*)::int AS n
       FROM bookings b
      WHERE b.status <> 'released'
        AND (b.starts_at AT TIME ZONE 'America/Chicago')::date
            BETWEEN $1::date AND $2::date
      GROUP BY 1`,
    [fromDate, toDate]
  );
}

export async function getBooking(id: string) {
  return one<Booking>(
    `SELECT b.id, b.request_id, r.reference_code,
            b.space_id, s.name AS space_name, s.building,
            b.title, b.note, b.status, b.is_blackout,
            to_char(b.starts_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS day,
            to_char(b.ends_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS end_day,
            to_char(b.starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS starts_at,
            to_char(b.ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS ends_at,
            to_char(b.event_starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS event_starts,
            to_char(b.event_ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') AS event_ends,
            0 AS start_minutes, 0 AS end_minutes,
            b.setup_minutes, b.teardown_minutes,
            coalesce(r.final_attendance, r.estimated_attendance) AS attendance,
            cd.classification,
            false AS has_conflict
       FROM bookings b
       JOIN spaces s ON s.id = b.space_id
       LEFT JOIN event_requests r ON r.id = b.request_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
      WHERE b.id = $1`,
    [id]
  );
}
