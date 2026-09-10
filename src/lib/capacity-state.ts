import { one, query } from './db';

/**
 * Where an event stands on capacity.
 *
 * One answer rather than three queries, shared by the requester's
 * page, the details gate and the staff view, so they cannot disagree
 * about whether an event is clear to proceed.
 */

export interface CapacityState {
  outcome: string | null;
  checked_at: string | null;
  proposed_date: string | null;
  proposed_space_id: string | null;
  proposed_space_name: string | null;
  proposed_detail: string | null;
  response: string | null;
  concerns: string | null;
}

export async function getCapacityState(requestId: string) {
  return one<CapacityState>(
    `SELECT outcome,
            to_char(checked_at, 'Mon FMDD, YYYY') AS checked_at,
            to_char(proposed_date, 'YYYY-MM-DD') AS proposed_date,
            proposed_space_id, proposed_space_name, proposed_detail,
            response, concerns
       FROM capacity_state($1)`,
    [requestId]
  );
}

export async function isReadyForDetails(requestId: string) {
  const row = await one<{ ready: boolean }>(
    'SELECT ready_for_details($1) AS ready',
    [requestId]
  );
  return row?.ready ?? false;
}

export interface OutstandingAlternative {
  request_id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  requester_name: string;
  proposed_date: string | null;
  proposed_space_name: string | null;
  proposed_detail: string | null;
  days_waiting: number;
}

/** Offers the requester has not answered yet. */
export async function listOutstandingAlternatives() {
  return query<OutstandingAlternative>(
    `SELECT request_id, reference_code, event_name,
            to_char(event_date, 'Mon FMDD, YYYY') AS event_date,
            requester_name,
            to_char(proposed_date, 'Mon FMDD, YYYY') AS proposed_date,
            proposed_space_name, proposed_detail, days_waiting
       FROM alternatives_outstanding`
  );
}
