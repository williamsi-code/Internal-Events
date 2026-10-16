/**
 * Where the queue divides, and what a row looks like.
 *
 * Kept apart from queue.ts because that module imports the database
 * client. A client component importing anything from it drags the
 * Postgres driver into the browser bundle and the build fails on
 * 'fs'.
 */

export interface QueueRow {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  start_time: string | null;
  status: string;
  requester_name: string;
  department_org: string;
  attendance: number;
  space_name: string | null;
  classification: string | null;
  short_notice: boolean;
  short_notice_state: string | null;
  room_unavailable: boolean;
  urgency: number;
  needs: string;
  waiting_days: number;
  days_away: number;
}

export const URGENCY_BANDS: {
  max: number;
  label: string;
  note: string;
}[] = [
  {
    max: 1,
    label: 'Urgent',
    note: 'A room that was already taken, or an event hours away with no answer',
  },
  {
    max: 5,
    label: 'Needs you',
    note: 'Classification, capacity, a reply, or a final look',
  },
  {
    max: 6,
    label: 'Close out',
    note: 'Happened and not yet reconciled',
  },
  {
    max: 7,
    label: 'Waiting on them',
    note: 'Nothing to do until the requester comes back',
  },
  {
    max: 99,
    label: 'Settled',
    note: 'Nothing outstanding',
  },
];
