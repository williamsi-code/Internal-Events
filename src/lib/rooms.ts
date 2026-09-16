import { query } from './db';

/**
 * Room bookings waiting on the events office.
 *
 * Small, time-critical work. The person who asked has put it in their
 * diary and is assuming the room is theirs, so an unanswered request
 * is worse than it looks.
 */

export interface RoomRequest {
  id: string;
  title: string;
  quick_purpose: string | null;
  quick_attendance: number | null;
  space_name: string;
  building: string | null;
  event_date: string;
  event_date_long: string;
  start_time: string;
  end_time: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  department_org: string | null;
  asked_at: string;
  days_away: number;
}

export async function listRoomRequests() {
  return query<RoomRequest>(
    `SELECT w.id, w.title, w.quick_purpose, w.quick_attendance,
            w.space_name, w.building,
            to_char(w.event_date, 'YYYY-MM-DD') AS event_date,
            to_char(w.event_date, 'FMDay, FMMonth FMDD') AS event_date_long,
            w.start_time, w.end_time,
            w.requested_by_name, w.requested_by_email, w.department_org,
            to_char(w.created_at, 'Mon FMDD at FMHH12:MI AM') AS asked_at,
            (w.event_date - CURRENT_DATE)::int AS days_away
       FROM quick_bookings_waiting w`
  );
}

export interface DecidedRoom {
  id: string;
  title: string;
  space_name: string;
  event_date_long: string;
  start_time: string;
  end_time: string;
  quick_state: string;
  requested_by_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/** Recently answered, so a decision can be seen and undone. */
export async function listRecentRoomDecisions() {
  return query<DecidedRoom>(
    `SELECT b.id, b.title, s.name AS space_name,
            to_char((b.event_starts_at AT TIME ZONE 'America/Chicago')::date,
                    'FMDay, FMMonth FMDD') AS event_date_long,
            to_char(b.event_starts_at AT TIME ZONE 'America/Chicago',
                    'FMHH12:MI AM') AS start_time,
            to_char(b.event_ends_at AT TIME ZONE 'America/Chicago',
                    'FMHH12:MI AM') AS end_time,
            b.quick_state::text,
            u.full_name AS requested_by_name,
            d.full_name AS decided_by_name,
            to_char(b.decided_at, 'Mon FMDD at FMHH12:MI AM') AS decided_at,
            b.decision_note
       FROM bookings b
       JOIN spaces s ON s.id = b.space_id
       LEFT JOIN users u ON u.id = b.requested_by
       LEFT JOIN users d ON d.id = b.decided_by
      WHERE b.is_quick_booking
        AND b.quick_state IN ('confirmed', 'refused')
        AND b.decided_at > now() - INTERVAL '14 days'
      ORDER BY b.decided_at DESC
      LIMIT 30`
  );
}

/** A person's own room bookings, for their requests page. */
export async function listMyRoomBookings(userId: string) {
  return query<DecidedRoom & { event_date: string }>(
    `SELECT b.id, b.title, s.name AS space_name,
            to_char((b.event_starts_at AT TIME ZONE 'America/Chicago')::date,
                    'YYYY-MM-DD') AS event_date,
            to_char((b.event_starts_at AT TIME ZONE 'America/Chicago')::date,
                    'FMDay, FMMonth FMDD') AS event_date_long,
            to_char(b.event_starts_at AT TIME ZONE 'America/Chicago',
                    'FMHH12:MI AM') AS start_time,
            to_char(b.event_ends_at AT TIME ZONE 'America/Chicago',
                    'FMHH12:MI AM') AS end_time,
            b.quick_state::text,
            u.full_name AS requested_by_name,
            d.full_name AS decided_by_name,
            to_char(b.decided_at, 'Mon FMDD') AS decided_at,
            b.decision_note
       FROM bookings b
       JOIN spaces s ON s.id = b.space_id
       LEFT JOIN users u ON u.id = b.requested_by
       LEFT JOIN users d ON d.id = b.decided_by
      WHERE b.is_quick_booking
        AND b.requested_by = $1
        AND b.status <> 'released'
        AND b.event_starts_at > now() - INTERVAL '1 day'
      ORDER BY b.event_starts_at`,
    [userId]
  );
}
