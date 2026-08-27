import { query, one } from './db';
import type { Classification } from './classify';

/**
 * Reporting.
 *
 * Everything takes a date range rather than a named period, so a
 * question about "last September" does not require someone to have
 * created a period row first. Named periods remain useful as
 * shortcuts and as what a published report attaches to.
 */

export interface ActivityRow {
  classification: string;
  events: number;
  attendance: number;
}

export async function getActivity(from: string, to: string) {
  return query<ActivityRow>('SELECT * FROM report_activity($1, $2)', [from, to]);
}

export interface FinancialRow {
  classification: string;
  events: number;
  food_cost: string;
  consumables_cost: string;
  labor_cost: string;
  other_cost: string;
  true_cost: string;
  charged: string;
  gap: string;
  labor_hours: string;
  closed_events: number;
}

export async function getFinancials(from: string, to: string) {
  return query<FinancialRow>('SELECT * FROM report_financials($1, $2)', [
    from,
    to,
  ]);
}

export interface LostRow {
  reason: string;
  occurrences: number;
  revenue_lost: string;
  referred_out: number;
}

export async function getLostBusiness(from: string, to: string) {
  return query<LostRow>('SELECT * FROM report_lost_business($1, $2)', [from, to]);
}

export interface Completeness {
  events_in_period: number;
  closed_out: number;
  with_actual_costs: number;
  with_final_attendance: number;
  cost_capture_pct: string | null;
}

export async function getCompleteness(from: string, to: string) {
  return one<Completeness>('SELECT * FROM report_completeness($1, $2)', [
    from,
    to,
  ]);
}

export interface ExceptionSummary {
  approved: number;
  denied: number;
  estimated_subsidy: string | null;
  actual_subsidy: string | null;
  undocumented: number;
}

export async function getExceptions(from: string, to: string) {
  return one<ExceptionSummary>(
    `SELECT
       count(*) FILTER (WHERE pe.authorization_state IN
         ('approved','approved_with_conditions')) AS approved,
       count(*) FILTER (WHERE pe.authorization_state = 'denied') AS denied,
       sum(pe.estimated_subsidy)::text AS estimated_subsidy,
       sum(pe.actual_subsidy)::text AS actual_subsidy,
       count(*) FILTER (WHERE pe.documented_at IS NULL
                          AND pe.authorization_state IS NOT NULL)
         AS undocumented
       FROM policy_exceptions pe
       JOIN event_requests r ON r.id = pe.request_id
      WHERE r.event_date BETWEEN $1 AND $2`,
    [from, to]
  );
}

export interface CapacitySummary {
  modified: number;
  declined_capacity: number;
  core_hours: string | null;
  variable_hours: string | null;
}

export async function getCapacitySummary(from: string, to: string) {
  return one<CapacitySummary>(
    `SELECT
       (SELECT count(*) FROM capacity_modifications m
          JOIN event_requests r ON r.id = m.request_id
         WHERE r.event_date BETWEEN $1 AND $2) AS modified,
       (SELECT count(*) FROM declined_business d
         WHERE d.requested_date BETWEEN $1 AND $2
           AND d.reason IN ('staffing_capacity','kitchen_capacity',
                            'facility_unavailable','equipment_unavailable'))
         AS declined_capacity,
       (SELECT sum(hours)::text FROM labor_entries
         WHERE period_start BETWEEN $1 AND $2 AND kind = 'core_staff')
         AS core_hours,
       (SELECT sum(hours)::text FROM labor_entries
         WHERE period_start BETWEEN $1 AND $2 AND kind <> 'core_staff')
         AS variable_hours`,
    [from, to]
  );
}

export interface TopSpace {
  space_name: string;
  building: string | null;
  events: number;
  guests: number;
}

export async function getTopSpaces(from: string, to: string) {
  return query<TopSpace>(
    `SELECT s.name AS space_name, s.building,
            count(*) AS events,
            coalesce(sum(coalesce(r.actual_attendance, r.final_attendance,
                                  r.estimated_attendance)), 0) AS guests
       FROM event_requests r
       JOIN spaces s ON s.id = r.space_id
      WHERE r.event_date BETWEEN $1 AND $2
        AND r.status IN ('confirmed','completed')
      GROUP BY s.name, s.building
      ORDER BY count(*) DESC
      LIMIT 8`,
    [from, to]
  );
}

export interface Period {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
}

export async function listPeriods() {
  return query<Period>(
    `SELECT id, label,
            to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
            to_char(ends_on, 'YYYY-MM-DD') AS ends_on
       FROM reporting_periods
      ORDER BY starts_on DESC`
  );
}

/* ------------------------------------------------------------
   Event explorer
   ------------------------------------------------------------ */

export interface EventFilters {
  from?: string;
  to?: string;
  classification?: string;
  status?: string;
  spaceId?: string;
  department?: string;
  foodSource?: string;
  search?: string;
}

export interface EventRow {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  status: string;
  department_org: string;
  requester_name: string;
  space_name: string | null;
  classification: Classification | null;
  attendance: number;
  charged: string;
  true_cost: string;
  food_sources: string;
  closed: boolean;
}

export async function searchEvents(f: EventFilters) {
  const where: string[] = ['r.status <> \'draft\''];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (f.from) where.push(`r.event_date >= ${p(f.from)}::date`);
  if (f.to) where.push(`r.event_date <= ${p(f.to)}::date`);
  if (f.classification)
    where.push(`cd.classification = ${p(f.classification)}::classification`);
  if (f.status) where.push(`r.status = ${p(f.status)}::request_status`);
  if (f.spaceId) where.push(`r.space_id = ${p(f.spaceId)}::uuid`);
  if (f.department)
    where.push(`r.department_org ILIKE ${p('%' + f.department + '%')}`);
  if (f.search)
    where.push(
      `(r.event_name ILIKE ${p('%' + f.search + '%')}
        OR r.reference_code ILIKE ${p('%' + f.search + '%')})`
    );
  if (f.foodSource)
    where.push(
      `EXISTS (SELECT 1 FROM event_food_sources fs
                WHERE fs.request_id = r.id
                  AND fs.kind = ${p(f.foodSource)}::food_source_kind)`
    );

  return query<EventRow>(
    `SELECT r.id, r.reference_code, r.event_name,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            r.status, r.department_org, r.requester_name,
            s.name AS space_name,
            cd.classification,
            coalesce(r.actual_attendance, r.final_attendance,
                     r.estimated_attendance) AS attendance,
            (coalesce(sp.estimated_charge, 0)
             + coalesce(r.facility_charge_applied, 0))::text AS charged,
            coalesce((SELECT sum(amount) FROM event_costs c
                       WHERE c.request_id = r.id AND c.is_actual), 0)::text
              AS true_cost,
            coalesce((SELECT string_agg(DISTINCT fs.kind::text, ', ')
                        FROM event_food_sources fs
                       WHERE fs.request_id = r.id), '') AS food_sources,
            (r.closed_at IS NOT NULL) AS closed
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
       LEFT JOIN service_paths sp
              ON sp.request_id = r.id AND sp.is_current
      WHERE ${where.join(' AND ')}
      ORDER BY r.event_date DESC
      LIMIT 500`,
    params
  );
}
