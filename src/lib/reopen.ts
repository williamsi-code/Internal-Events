import { one, query } from './db';

/**
 * Detail changes after confirmation.
 */

export interface DetailsLockState {
  details_confirmed_at: string | null;
  details_reopened_at: string | null;
  details_reopened_by: string | null;
  details_reopen_count: number;
  closed_at: string | null;
  event_date: string;
  days_out: number;
  headcount_submitted_at: string | null;
  menu_total: string;
}

export async function getDetailsLockState(requestId: string) {
  return one<DetailsLockState>(
    `SELECT to_char(r.details_confirmed_at, 'Mon FMDD, YYYY') AS details_confirmed_at,
            to_char(r.details_reopened_at, 'Mon FMDD, YYYY') AS details_reopened_at,
            u.full_name AS details_reopened_by,
            r.details_reopen_count,
            to_char(r.closed_at, 'Mon FMDD, YYYY') AS closed_at,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            (r.event_date - CURRENT_DATE) AS days_out,
            to_char(r.headcount_submitted_at, 'Mon FMDD') AS headcount_submitted_at,
            coalesce((SELECT sum(sel.quantity * sel.unit_price_quoted)
                        FROM request_menu_selections sel
                       WHERE sel.request_id = r.id), 0)::text AS menu_total
       FROM event_requests r
       LEFT JOIN users u ON u.id = r.details_reopened_by
      WHERE r.id = $1`,
    [requestId]
  );
}

export interface MenuVersion {
  captured_at: string;
  captured_reason: string | null;
  captured_by_name: string | null;
  total: string;
  items: { item: string; quantity: number; unit_price: string }[];
}

/** Previous versions of the order, captured each time details were
 *  reopened. The answer to "we never ordered that". */
export async function getMenuHistory(requestId: string) {
  return query<MenuVersion>(
    `SELECT to_char(h.captured_at, 'Mon FMDD, YYYY at FMHH12:MI AM') AS captured_at,
            h.captured_reason,
            u.full_name AS captured_by_name,
            h.total::text,
            h.selections AS items
       FROM menu_selection_history h
       LEFT JOIN users u ON u.id = h.captured_by
      WHERE h.request_id = $1
      ORDER BY h.captured_at DESC`,
    [requestId]
  );
}
