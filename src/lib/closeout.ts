import { query, one } from './db';
import type { Classification } from './classify';

/**
 * Close-out.
 *
 * The value of this step is entirely in whether it actually happens,
 * so every number that can be suggested is suggested. Staff correct
 * a pre-filled figure rather than producing one from memory a week
 * after the event.
 */

export interface AwaitingCloseout {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  days_since: number;
  expected_attendance: number;
  department_org: string;
  classification: Classification | null;
  quoted_total: string;
}

export async function listAwaitingCloseout() {
  return query<AwaitingCloseout>(
    `SELECT id, reference_code, event_name,
            to_char(event_date, 'YYYY-MM-DD') AS event_date,
            days_since, expected_attendance, department_org,
            classification, quoted_total::text
       FROM awaiting_closeout`
  );
}

export interface CloseoutState {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  event_date_long: string;
  department_org: string;
  requester_name: string;
  space_name: string | null;
  classification: Classification | null;
  estimated_attendance: number;
  final_attendance: number | null;
  actual_attendance: number | null;
  charged: string | null;
  quoted_total: string;
  suggested_food_cost: string;
  closed_at: string | null;
  closed_by_name: string | null;
  closeout_notes: string | null;
  did_not_occur: boolean;
  food_cost: string | null;
  consumables_cost: string | null;
  labor_cost: string | null;
  other_cost: string | null;
  labor_hours: string | null;
}

export async function getCloseoutState(requestId: string) {
  return one<CloseoutState>(
    `SELECT r.id, r.reference_code, r.event_name,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            to_char(r.event_date, 'FMDay, FMMonth FMDD, YYYY') AS event_date_long,
            r.department_org, r.requester_name,
            s.name AS space_name,
            cd.classification,
            r.estimated_attendance, r.final_attendance, r.actual_attendance,
            sp.estimated_charge::text AS charged,
            coalesce((SELECT sum(sel.quantity * sel.unit_price_quoted)
                        FROM request_menu_selections sel
                       WHERE sel.request_id = r.id), 0)::text AS quoted_total,
            suggested_food_cost(r.id)::text AS suggested_food_cost,
            to_char(r.closed_at, 'Mon FMDD, YYYY') AS closed_at,
            u.full_name AS closed_by_name,
            r.closeout_notes, r.did_not_occur,
            (SELECT amount::text FROM event_costs c
              WHERE c.request_id=r.id AND c.is_actual AND c.category='food')
              AS food_cost,
            (SELECT amount::text FROM event_costs c
              WHERE c.request_id=r.id AND c.is_actual AND c.category='consumables')
              AS consumables_cost,
            (SELECT amount::text FROM event_costs c
              WHERE c.request_id=r.id AND c.is_actual AND c.category='labor')
              AS labor_cost,
            (SELECT amount::text FROM event_costs c
              WHERE c.request_id=r.id AND c.is_actual AND c.category='other_direct')
              AS other_cost,
            (SELECT sum(hours)::text FROM labor_entries l
              WHERE l.request_id = r.id) AS labor_hours
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
       LEFT JOIN service_paths sp ON sp.request_id = r.id AND sp.is_current
       LEFT JOIN users u ON u.id = r.closed_by
      WHERE r.id = $1`,
    [requestId]
  );
}

export interface CloseoutSummary {
  closed_this_month: number;
  outstanding: number;
  oldest_days: number | null;
  cost_capture_pct: number | null;
}

/** How well close-out is actually being kept up with. A reporting
 *  layer resting on half the events is worse than none. */
export async function getCloseoutSummary() {
  return one<CloseoutSummary>(
    `SELECT
       (SELECT count(*) FROM event_requests
         WHERE closed_at >= date_trunc('month', CURRENT_DATE))
         AS closed_this_month,
       (SELECT count(*) FROM awaiting_closeout) AS outstanding,
       (SELECT max(days_since) FROM awaiting_closeout) AS oldest_days,
       (SELECT round(100.0 * count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM event_costs c
                  WHERE c.request_id = r.id AND c.is_actual))
               / nullif(count(*), 0), 0)
          FROM event_requests r
         WHERE r.status = 'completed'
           AND r.event_date >= CURRENT_DATE - INTERVAL '90 days')
         AS cost_capture_pct`
  );
}
