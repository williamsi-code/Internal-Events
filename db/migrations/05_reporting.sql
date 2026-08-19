-- ============================================================
-- Central College Events & Conferences
-- Migration 05 — Cost capture and quarterly reporting
--
-- The earlier migrations record what a requester is CHARGED.
-- This one records what an event COSTS. The difference between
-- them is the number the Quarterly Leadership Report exists to
-- show: institutional support for Internal events, partnership
-- support for Affiliated ones, and contribution from External.
--
--   B. Event Activity ............. quarterly_activity
--   C. Internal Support ........... internal_support
--   D. Affiliated Support ......... affiliated_support
--   E. External Performance ....... external_performance
--   F. Staffing & Capacity ........ staffing_capacity
--   G. Facilities & Equipment ..... facility_log (narrative + data)
--   H. Lost / Declined Business ... lost_business
--   I. Exceptions & Risk .......... from migration 04
--
-- Sections A, J and K stay narrative — they are judgment, not
-- arithmetic, and should not be auto-generated.
-- ============================================================

-- ------------------------------------------------------------
-- Cost capture
-- ------------------------------------------------------------

CREATE TYPE cost_category AS ENUM (
  'food',
  'consumables',       -- disposables, linens, service ware
  'labor',
  'other_direct'       -- rentals, equipment, contracted services
);

CREATE TABLE event_costs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  category     cost_category NOT NULL,
  amount       numeric(10,2) NOT NULL CHECK (amount >= 0),
  -- Estimated costs support the pre-event quote; actuals drive the
  -- report. Keep both so the estimate can be audited against reality.
  is_actual    boolean NOT NULL DEFAULT false,
  note         text,
  recorded_by  uuid REFERENCES users(id),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, category, is_actual)
);

CREATE INDEX ON event_costs (request_id) WHERE is_actual;

-- ------------------------------------------------------------
-- Labor. Separate from event_costs because Section F reports
-- hours by type, not only dollars.
-- ------------------------------------------------------------

CREATE TYPE labor_type AS ENUM (
  'core_staff',
  'variable_event',
  'student_part_time',
  'overtime'
);

CREATE TABLE labor_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid REFERENCES event_requests(id) ON DELETE CASCADE,
  -- Nullable request_id allows recording baseline core staffing
  -- for a period that is not attributable to a single event.
  period_start date NOT NULL,
  kind         labor_type NOT NULL,
  hours        numeric(8,2) NOT NULL CHECK (hours >= 0),
  cost         numeric(10,2) CHECK (cost >= 0),
  note         text,
  recorded_by  uuid REFERENCES users(id),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON labor_entries (period_start, kind);
CREATE INDEX ON labor_entries (request_id);

-- ------------------------------------------------------------
-- Declined and modified business (Section H)
-- ------------------------------------------------------------

CREATE TYPE decline_reason AS ENUM (
  'staffing_capacity',
  'kitchen_capacity',
  'facility_unavailable',
  'equipment_unavailable',
  'date_conflict',
  'price_not_accepted',
  'requester_withdrew',
  'policy_or_risk',
  'other'
);

CREATE TABLE declined_business (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid REFERENCES event_requests(id) ON DELETE SET NULL,
  -- Enquiries that never became requests still count as lost business.
  event_name              text NOT NULL,
  requested_date          date,
  classification_expected classification,
  reason                  decline_reason NOT NULL,
  -- What we would have billed. Without this, Section H is a count
  -- with no weight behind it.
  estimated_revenue_lost  numeric(10,2) CHECK (estimated_revenue_lost >= 0),
  -- Distinguishes "we referred them out because we could not staff it"
  -- from an outside caterer approved for any other reason. These mean
  -- very different things to leadership.
  outside_caterer_used    boolean NOT NULL DEFAULT false,
  detail                  text,
  recorded_by             uuid REFERENCES users(id),
  recorded_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON declined_business (requested_date);
CREATE INDEX ON declined_business (reason);

-- Events that went ahead but in altered form. Distinct from declines:
-- these are the near-misses that show strain before it becomes loss.
CREATE TABLE capacity_modifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  reason       decline_reason NOT NULL,
  what_changed text NOT NULL,
  recorded_by  uuid REFERENCES users(id),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON capacity_modifications (request_id);

-- ------------------------------------------------------------
-- Facilities and equipment (Section G)
-- ------------------------------------------------------------

CREATE TYPE facility_note_kind AS ENUM (
  'constraint',
  'equipment_issue',
  'capital_need'
);

CREATE TABLE facility_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid REFERENCES spaces(id),
  request_id    uuid REFERENCES event_requests(id) ON DELETE SET NULL,
  kind          facility_note_kind NOT NULL,
  summary       text NOT NULL,
  estimated_cost numeric(10,2),
  occurred_on   date NOT NULL DEFAULT CURRENT_DATE,
  resolved_at   timestamptz,
  recorded_by   uuid REFERENCES users(id),
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON facility_log (kind, occurred_on DESC);

-- ------------------------------------------------------------
-- Reporting periods and the narrative half of the report
-- ------------------------------------------------------------

CREATE TYPE leadership_decision_area AS ENUM (
  'no_action', 'staffing', 'pricing', 'policy', 'facility',
  'equipment_capital', 'budget', 'strategic_partnership', 'other'
);

CREATE TABLE reporting_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text UNIQUE NOT NULL,       -- 'FY26 Q1'
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  is_closed   boolean NOT NULL DEFAULT false,
  CHECK (ends_on > starts_on)
);

CREATE TABLE leadership_reports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id            uuid NOT NULL UNIQUE REFERENCES reporting_periods(id),
  prepared_by          uuid NOT NULL REFERENCES users(id),

  -- A. Narrative
  executive_summary    text,
  key_takeaway         text,

  -- Commentary that the numbers cannot supply
  internal_trends      text,
  affiliated_benefits  text,
  external_trends      text,
  capacity_constraint  text,
  facility_constraints text,
  capital_needs        text,
  lost_reasons         text,
  risk_issues          text,

  -- J. Leadership decisions needed
  decision_request     text,
  recommended_action   text,
  decision_needed_by   date,

  -- K. Next-quarter outlook
  upcoming             text,
  opportunities        text,
  next_risks           text,
  priorities           text,

  -- Frozen copy of the computed figures at publication, so a report
  -- circulated in October still shows October's numbers next year.
  figures_snapshot     jsonb,
  published_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leadership_report_areas (
  report_id uuid NOT NULL REFERENCES leadership_reports(id) ON DELETE CASCADE,
  area      leadership_decision_area NOT NULL,
  PRIMARY KEY (report_id, area)
);

-- ------------------------------------------------------------
-- Section B — Event activity
-- ------------------------------------------------------------

CREATE VIEW quarterly_activity AS
SELECT
  p.label AS period,
  cd.classification,
  count(*)                                  AS events,
  sum(coalesce(r.final_attendance, r.estimated_attendance)) AS attendance
FROM reporting_periods p
JOIN event_requests r
  ON r.event_date BETWEEN p.starts_on AND p.ends_on
 AND r.status IN ('confirmed', 'completed')
JOIN classification_decisions cd
  ON cd.request_id = r.id AND cd.is_current
GROUP BY p.label, cd.classification;

-- ------------------------------------------------------------
-- Shared cost roll-up, used by sections C, D and E
-- ------------------------------------------------------------

CREATE VIEW event_cost_summary AS
SELECT
  r.id AS request_id,
  cd.classification,
  r.event_date,
  coalesce(sum(c.amount) FILTER (WHERE c.category = 'food'), 0)          AS food_cost,
  coalesce(sum(c.amount) FILTER (WHERE c.category = 'consumables'), 0)   AS consumables_cost,
  coalesce(sum(c.amount) FILTER (WHERE c.category = 'labor'), 0)         AS labor_cost,
  coalesce(sum(c.amount) FILTER (WHERE c.category = 'other_direct'), 0)  AS other_cost,
  coalesce(sum(c.amount), 0)                                            AS true_cost,
  coalesce(sp.estimated_charge, 0)                                      AS charged
FROM event_requests r
JOIN classification_decisions cd
  ON cd.request_id = r.id AND cd.is_current
LEFT JOIN event_costs c
  ON c.request_id = r.id AND c.is_actual
LEFT JOIN service_paths sp
  ON sp.request_id = r.id AND sp.is_current
WHERE r.status IN ('confirmed', 'completed')
GROUP BY r.id, cd.classification, r.event_date, sp.estimated_charge;

-- Section C. Institutional support is the gap between what an
-- Internal event costs and what the department was charged.
CREATE VIEW internal_support AS
SELECT
  p.label AS period,
  sum(s.food_cost)         AS internal_food_cost,
  sum(s.consumables_cost)  AS internal_consumables,
  sum(s.labor_cost)        AS internal_labor,
  sum(s.charged)           AS department_charges,
  sum(s.true_cost)         AS true_cost,
  sum(s.true_cost) - sum(s.charged) AS institutional_support
FROM reporting_periods p
JOIN event_cost_summary s
  ON s.event_date BETWEEN p.starts_on AND p.ends_on
WHERE s.classification = 'internal'
GROUP BY p.label;

-- Section D. Same arithmetic, different name: what the College
-- invests in its partnerships.
CREATE VIEW affiliated_support AS
SELECT
  p.label AS period,
  sum(s.charged)   AS affiliated_charges,
  sum(s.true_cost) AS true_cost,
  sum(s.true_cost) - sum(s.charged) AS partnership_support
FROM reporting_periods p
JOIN event_cost_summary s
  ON s.event_date BETWEEN p.starts_on AND p.ends_on
WHERE s.classification = 'affiliated'
GROUP BY p.label;

-- Section E. External is the only category where the gap runs
-- the other way and is called contribution.
CREATE VIEW external_performance AS
SELECT
  p.label AS period,
  count(*)                 AS external_events,
  sum(s.charged)           AS external_revenue,
  sum(s.food_cost)         AS food_cost,
  sum(s.labor_cost)        AS labor_cost,
  sum(s.other_cost)        AS other_direct,
  sum(s.true_cost)         AS true_cost,
  sum(s.charged) - sum(s.true_cost) AS contribution,
  CASE WHEN sum(s.charged) > 0
       THEN round(100.0 * (sum(s.charged) - sum(s.true_cost)) / sum(s.charged), 1)
  END                      AS contribution_margin_pct,
  round(avg(s.charged), 2) AS avg_revenue_per_event
FROM reporting_periods p
JOIN event_cost_summary s
  ON s.event_date BETWEEN p.starts_on AND p.ends_on
WHERE s.classification = 'external'
GROUP BY p.label;

-- ------------------------------------------------------------
-- Section F — Staffing and capacity
-- ------------------------------------------------------------

CREATE VIEW staffing_capacity AS
SELECT
  p.label AS period,
  coalesce(sum(l.hours) FILTER (WHERE l.kind = 'core_staff'), 0)        AS core_hours,
  coalesce(sum(l.hours) FILTER (WHERE l.kind = 'variable_event'), 0)    AS variable_hours,
  coalesce(sum(l.hours) FILTER (WHERE l.kind = 'student_part_time'), 0) AS student_pt_hours,
  coalesce(sum(l.hours) FILTER (WHERE l.kind = 'overtime'), 0)          AS overtime_hours,
  (SELECT count(*) FROM capacity_modifications m
     JOIN event_requests r2 ON r2.id = m.request_id
    WHERE r2.event_date BETWEEN p.starts_on AND p.ends_on)              AS events_modified,
  (SELECT count(*) FROM declined_business d
    WHERE d.requested_date BETWEEN p.starts_on AND p.ends_on
      AND d.reason IN ('staffing_capacity','kitchen_capacity',
                       'facility_unavailable','equipment_unavailable'))  AS events_declined_capacity
FROM reporting_periods p
LEFT JOIN labor_entries l
  ON l.period_start BETWEEN p.starts_on AND p.ends_on
GROUP BY p.label, p.starts_on, p.ends_on;

-- ------------------------------------------------------------
-- Section H — Lost and declined business
-- ------------------------------------------------------------

CREATE VIEW lost_business AS
SELECT
  p.label AS period,
  count(*)                                    AS opportunities_lost,
  sum(d.estimated_revenue_lost)               AS revenue_lost,
  count(*) FILTER (WHERE d.outside_caterer_used) AS referred_to_outside_caterer,
  count(*) FILTER (WHERE d.classification_expected = 'external') AS external_lost
FROM reporting_periods p
JOIN declined_business d
  ON d.requested_date BETWEEN p.starts_on AND p.ends_on
GROUP BY p.label;

CREATE VIEW lost_business_by_reason AS
SELECT
  p.label AS period,
  d.reason,
  count(*)                      AS occurrences,
  sum(d.estimated_revenue_lost) AS revenue_lost
FROM reporting_periods p
JOIN declined_business d
  ON d.requested_date BETWEEN p.starts_on AND p.ends_on
GROUP BY p.label, d.reason
ORDER BY sum(d.estimated_revenue_lost) DESC NULLS LAST;

-- ------------------------------------------------------------
-- Section I — Exceptions and risk
-- ------------------------------------------------------------

CREATE VIEW quarterly_exceptions AS
SELECT
  p.label AS period,
  count(*) FILTER (WHERE pe.authorization_state IN
    ('approved','approved_with_conditions'))          AS exceptions_approved,
  count(*) FILTER (WHERE pe.authorization_state = 'denied')  AS exceptions_denied,
  sum(pe.actual_subsidy)                              AS actual_subsidy,
  sum(pe.estimated_subsidy)                           AS estimated_subsidy,
  count(*) FILTER (WHERE pe.documented_at IS NULL
                     AND pe.authorization_state IS NOT NULL) AS undocumented
FROM reporting_periods p
JOIN event_requests r
  ON r.event_date BETWEEN p.starts_on AND p.ends_on
JOIN policy_exceptions pe ON pe.request_id = r.id
GROUP BY p.label;

-- ------------------------------------------------------------
-- Data-quality gate. A report built on events with no recorded
-- actual costs will understate true cost and overstate
-- contribution. Check this before publishing.
-- ------------------------------------------------------------

CREATE VIEW reporting_completeness AS
SELECT
  p.label AS period,
  count(*)                                                       AS events_in_period,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM event_costs c WHERE c.request_id = r.id AND c.is_actual
  ))                                                             AS missing_actual_costs,
  count(*) FILTER (WHERE r.final_attendance IS NULL)             AS missing_final_attendance,
  round(100.0 * count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM event_costs c WHERE c.request_id = r.id AND c.is_actual
  )) / nullif(count(*), 0), 1)                                   AS cost_capture_pct
FROM reporting_periods p
JOIN event_requests r
  ON r.event_date BETWEEN p.starts_on AND p.ends_on
 AND r.status IN ('confirmed', 'completed')
GROUP BY p.label;

