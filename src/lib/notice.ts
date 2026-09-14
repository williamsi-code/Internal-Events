import { one, query } from './db';

/**
 * Short notice.
 *
 * How far ahead a room must normally be booked, and what happens when
 * someone asks for less.
 */

export interface NoticeCheck {
  hours_notice: string;
  required_hours: number;
  is_short: boolean;
  space_name: string;
}

export async function checkNotice(
  spaceId: string,
  date: string,
  time: string | null
) {
  return one<NoticeCheck>('SELECT * FROM notice_check($1, $2, $3)', [
    spaceId,
    date,
    time,
  ]);
}

export interface ShortNoticeWaiting {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  start_time: string | null;
  requester_name: string;
  department_org: string;
  estimated_attendance: number;
  short_notice_reason: string | null;
  space_name: string | null;
  minimum_notice_hours: number;
  hours_away: string;
}

export async function listShortNoticeWaiting() {
  return query<ShortNoticeWaiting>(
    `SELECT id, reference_code, event_name,
            to_char(event_date, 'Mon FMDD') AS event_date,
            to_char(start_time, 'FMHH12:MI AM') AS start_time,
            requester_name, department_org, estimated_attendance,
            short_notice_reason, space_name, minimum_notice_hours,
            hours_away::text
       FROM short_notice_waiting`
  );
}

export interface ShortNoticeState {
  short_notice: boolean;
  state: string | null;
  reason: string | null;
  note: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  hours_away: string | null;
  required_hours: number | null;
}

export async function getShortNotice(requestId: string) {
  return one<ShortNoticeState>(
    `SELECT r.short_notice,
            r.short_notice_state::text AS state,
            r.short_notice_reason AS reason,
            r.short_notice_note AS note,
            to_char(r.short_notice_decided_at, 'Mon FMDD at FMHH12:MI AM')
              AS decided_at,
            u.full_name AS decided_by_name,
            round(
              EXTRACT(epoch FROM (
                (r.event_date + coalesce(r.start_time, TIME '08:00'))
                  AT TIME ZONE 'America/Chicago'
              ) - now()) / 3600.0, 1
            )::text AS hours_away,
            s.minimum_notice_hours AS required_hours
       FROM event_requests r
       LEFT JOIN users u ON u.id = r.short_notice_decided_by
       LEFT JOIN spaces s ON s.id = r.space_id
      WHERE r.id = $1`,
    [requestId]
  );
}
