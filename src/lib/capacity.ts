import { query, one } from './db';

/**
 * Capacity check.
 *
 * The point of this screen is to replace guesswork with what the
 * system already knows: what else is booked in that space, how much
 * is running that day, and whether the room is big enough. Staff
 * still make the call - kitchen and staffing judgement is not
 * something a query can supply - but they make it looking at facts.
 */

export interface CapacityContext {
  request_id: string;
  event_date: string;
  event_date_long: string;
  attendance: number;
  space_id: string | null;
  space_name: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean | null;

  /** Other bookings in the same space that day. */
  space_conflicts: number;
  /** Everything running that day, across all spaces. */
  events_that_day: number;
  guests_that_day: number;

  existing_outcome: string | null;
  checked_at: string | null;
  checked_by_name: string | null;
}

export async function getCapacityContext(requestId: string) {
  return one<CapacityContext>(
    `SELECT r.id AS request_id,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            to_char(r.event_date, 'FMDay, FMMonth FMDD') AS event_date_long,
            coalesce(r.final_attendance, r.estimated_attendance) AS attendance,
            r.space_id, s.name AS space_name,
            s.capacity_seated, s.capacity_standing, s.supports_catering,

            (SELECT count(*) FROM bookings b
              WHERE b.space_id = r.space_id
                AND b.status <> 'released'
                AND b.request_id IS DISTINCT FROM r.id
                AND (b.starts_at AT TIME ZONE 'America/Chicago')::date
                    = r.event_date) AS space_conflicts,

            coalesce((SELECT confirmed_events + tentative_events
                        FROM daily_load d WHERE d.day = r.event_date), 0)
              AS events_that_day,
            coalesce((SELECT coalesce(confirmed_guests,0) + coalesce(tentative_guests,0)
                        FROM daily_load d WHERE d.day = r.event_date), 0)
              AS guests_that_day,

            cc.outcome::text AS existing_outcome,
            to_char(cc.checked_at, 'Mon FMDD, YYYY') AS checked_at,
            u.full_name AS checked_by_name
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN LATERAL (
         SELECT outcome, checked_at, checked_by
           FROM capacity_checks
          WHERE request_id = r.id
          ORDER BY checked_at DESC
          LIMIT 1
       ) cc ON true
       LEFT JOIN users u ON u.id = cc.checked_by
      WHERE r.id = $1`,
    [requestId]
  );
}

export interface SameDayBooking {
  title: string;
  space_name: string;
  status: string;
  window: string;
  request_id: string | null;
  attendance: number | null;
}

/** Everything else on the calendar that day, so the staffing call is
 *  made against the real picture rather than one event in isolation. */
export async function listSameDayBookings(requestId: string) {
  return query<SameDayBooking>(
    `SELECT b.title, s.name AS space_name, b.status::text,
            to_char(b.event_starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
              || ' - ' ||
            to_char(b.event_ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
              AS window,
            b.request_id,
            coalesce(o.final_attendance, o.estimated_attendance) AS attendance
       FROM bookings b
       JOIN spaces s ON s.id = b.space_id
       LEFT JOIN event_requests o ON o.id = b.request_id
      WHERE b.status <> 'released'
        AND (b.starts_at AT TIME ZONE 'America/Chicago')::date
            = (SELECT event_date FROM event_requests WHERE id = $1)
        AND b.request_id IS DISTINCT FROM $1
      ORDER BY b.starts_at`,
    [requestId]
  );
}

export interface AltSpace {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  free: boolean;
}

/** Spaces big enough for this event, with whether they are free that
 *  day - the shortlist for offering an alternative. */
export async function listAlternativeSpaces(requestId: string) {
  return query<AltSpace>(
    `SELECT s.id, s.name, s.building, s.capacity_seated,
            NOT EXISTS (
              SELECT 1 FROM bookings b
               WHERE b.space_id = s.id
                 AND b.status <> 'released'
                 AND (b.starts_at AT TIME ZONE 'America/Chicago')::date
                     = r.event_date
            ) AS free
       FROM spaces s
       CROSS JOIN event_requests r
      WHERE r.id = $1
        AND s.is_active
        AND s.id IS DISTINCT FROM r.space_id
        AND coalesce(s.capacity_standing, s.capacity_seated, 0)
            >= coalesce(r.final_attendance, r.estimated_attendance)
      ORDER BY s.capacity_seated NULLS LAST, s.sort_order`,
    [requestId]
  );
}
