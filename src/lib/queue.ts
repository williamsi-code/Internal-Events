import { query, one } from './db';
import type { QueueRow } from './queue-bands';

export type { QueueRow } from './queue-bands';
export { URGENCY_BANDS } from './queue-bands';

/**
 * The staff queue, in the order it should be worked.
 *
 * Date order is right for a diary and wrong for a work list. An
 * event in March that needs classifying today matters more than one
 * next week that is already settled.
 */

export async function listQueue() {
  return query<QueueRow>(
    `SELECT id, reference_code, event_name,
            to_char(event_date, 'Mon FMDD, YYYY') AS event_date,
            to_char(start_time, 'FMHH12:MI AM') AS start_time,
            status, requester_name, department_org, attendance,
            space_name, classification, short_notice,
            short_notice_state, room_unavailable,
            urgency, needs, waiting_days, days_away
       FROM staff_queue`
  );
}

export async function getQueueCounts() {
  return one<{
    needs_us: number;
    waiting_on_them: number;
    settled: number;
    clashes: number;
    oldest_waiting: number;
  }>(
    `SELECT
       count(*) FILTER (WHERE urgency <= 6)::int AS needs_us,
       count(*) FILTER (WHERE urgency = 7)::int AS waiting_on_them,
       count(*) FILTER (WHERE urgency = 8)::int AS settled,
       count(*) FILTER (WHERE room_unavailable)::int AS clashes,
       coalesce(max(waiting_days) FILTER (WHERE urgency <= 6), 0)::int
         AS oldest_waiting
       FROM staff_queue`
  );
}
