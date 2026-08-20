import { one, query } from './db';

/**
 * What has changed since the event was classified.
 *
 * Staff can reclassify at any time, so this is a prompt rather than a
 * gate: it tells them which of the many requests waiting for final
 * review actually warrant a second look, and leaves the rest alone.
 *
 * Only fields that could plausibly move an event between
 * classifications are compared. A changed room setup is not a
 * classification concern; a changed revenue arrangement is.
 */

export interface Change {
  field: string;
  label: string;
  before: string;
  after: string;
  /** True when the change plausibly affects which classification applies. */
  material: boolean;
}

interface SnapshotRow {
  estimated_attendance: number | null;
  event_date: string | null;
  space_id: string | null;
  outside_org_involved: boolean | null;
  outside_funding: boolean | null;
  revenue_collected: boolean | null;
  revenue_recipient: string | null;
  food_needs: string | null;
  now_attendance: number;
  now_event_date: string;
  now_space_id: string | null;
  now_outside_org: boolean | null;
  now_outside_funding: boolean | null;
  now_revenue: boolean | null;
  now_revenue_recipient: string | null;
  now_food_needs: string | null;
  snapshot_space: string | null;
  current_space: string | null;
}

const yn = (v: boolean | null) => (v ? 'Yes' : 'No');

export async function changesSinceClassification(
  requestId: string
): Promise<Change[]> {
  const row = await one<SnapshotRow>(
    `SELECT s.estimated_attendance, to_char(s.event_date,'Mon DD, YYYY') AS event_date,
            s.space_id, s.outside_org_involved, s.outside_funding,
            s.revenue_collected, s.revenue_recipient, s.food_needs,
            r.estimated_attendance AS now_attendance,
            to_char(r.event_date,'Mon DD, YYYY') AS now_event_date,
            r.space_id AS now_space_id,
            f.outside_org_involved AS now_outside_org,
            f.outside_funding AS now_outside_funding,
            f.revenue_collected AS now_revenue,
            f.revenue_recipient AS now_revenue_recipient,
            req.food_needs AS now_food_needs,
            ss.name AS snapshot_space,
            cs.name AS current_space
       FROM event_requests r
       JOIN classification_decisions cd
         ON cd.request_id = r.id AND cd.is_current
       JOIN classification_snapshots s ON s.decision_id = cd.id
       LEFT JOIN event_funding f ON f.request_id = r.id
       LEFT JOIN event_requirements req ON req.request_id = r.id
       LEFT JOIN spaces ss ON ss.id = s.space_id
       LEFT JOIN spaces cs ON cs.id = r.space_id
      WHERE r.id = $1`,
    [requestId]
  );

  if (!row) return [];

  const changes: Change[] = [];

  // Attendance only matters once it moves meaningfully. A couple of
  // extra guests is noise; a doubling is a different event.
  if (
    row.estimated_attendance !== null &&
    row.now_attendance !== row.estimated_attendance
  ) {
    const before = row.estimated_attendance;
    const after = row.now_attendance;
    const ratio = before > 0 ? after / before : 1;
    changes.push({
      field: 'attendance',
      label: 'Estimated attendance',
      before: String(before),
      after: String(after),
      material: ratio >= 1.5 || ratio <= 0.5 || Math.abs(after - before) >= 50,
    });
  }

  if (row.event_date !== row.now_event_date) {
    changes.push({
      field: 'event_date',
      label: 'Event date',
      before: row.event_date ?? 'not set',
      after: row.now_event_date,
      material: false,
    });
  }

  if (row.space_id !== row.now_space_id) {
    changes.push({
      field: 'space',
      label: 'Space',
      before: row.snapshot_space ?? 'not set',
      after: row.current_space ?? 'not set',
      material: false,
    });
  }

  if (row.outside_org_involved !== row.now_outside_org) {
    changes.push({
      field: 'outside_org',
      label: 'Outside organization involved',
      before: yn(row.outside_org_involved),
      after: yn(row.now_outside_org),
      material: true,
    });
  }

  if (row.outside_funding !== row.now_outside_funding) {
    changes.push({
      field: 'outside_funding',
      label: 'Outside funding',
      before: yn(row.outside_funding),
      after: yn(row.now_outside_funding),
      material: true,
    });
  }

  if (row.revenue_collected !== row.now_revenue) {
    changes.push({
      field: 'revenue',
      label: 'Revenue collected',
      before: yn(row.revenue_collected),
      after: yn(row.now_revenue),
      material: true,
    });
  }

  if ((row.revenue_recipient ?? '') !== (row.now_revenue_recipient ?? '')) {
    changes.push({
      field: 'revenue_recipient',
      label: 'Revenue recipient',
      before: row.revenue_recipient || 'none',
      after: row.now_revenue_recipient || 'none',
      material: true,
    });
  }

  // An outside caterer appearing after classification is worth flagging:
  // it is a management review trigger on the decision sheet.
  const cateredBefore = /caterer|catering company|outside food/i.test(
    row.food_needs ?? ''
  );
  const cateredNow = /caterer|catering company|outside food/i.test(
    row.now_food_needs ?? ''
  );
  if (cateredBefore !== cateredNow) {
    changes.push({
      field: 'outside_caterer',
      label: 'Outside caterer mentioned',
      before: yn(cateredBefore),
      after: yn(cateredNow),
      material: true,
    });
  }

  return changes;
}

export interface FinalReviewRow {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  estimated_attendance: number;
  department_org: string;
  classification: string;
  details_confirmed_at: string;
  estimate_total: string;
}

/** Requests waiting for the final classification check. */
export async function listPendingFinalReview() {
  return query<FinalReviewRow>(
    `SELECT r.id, r.reference_code, r.event_name,
            to_char(r.event_date,'YYYY-MM-DD') AS event_date,
            r.estimated_attendance, r.department_org,
            cd.classification,
            to_char(r.details_confirmed_at,'Mon DD, YYYY') AS details_confirmed_at,
            coalesce(sum(sel.quantity * sel.unit_price_quoted), 0)::text AS estimate_total
       FROM event_requests r
       JOIN classification_decisions cd
         ON cd.request_id = r.id AND cd.is_current
       LEFT JOIN request_menu_selections sel ON sel.request_id = r.id
      WHERE r.status = 'pending_final_review'
      GROUP BY r.id, cd.classification
      ORDER BY r.event_date`
  );
}
