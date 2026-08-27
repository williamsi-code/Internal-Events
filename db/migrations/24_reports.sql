-- ============================================================
-- Migration 24 - Reporting periods and range functions
--
-- The views from migration 05 join to reporting_periods, which has
-- never had rows in it. Rather than depend on someone remembering to
-- create a period before running a report, the functions here take a
-- date range directly. Periods remain useful as named shortcuts and
-- as the thing a published report is attached to.
--
-- EDIT THE PERIODS BELOW to match Central's fiscal year. These assume
-- a June start, which is a guess.
-- ============================================================

INSERT INTO reporting_periods (label, starts_on, ends_on) VALUES
  ('FY26 Q1', '2025-06-01', '2025-08-31'),
  ('FY26 Q2', '2025-09-01', '2025-11-30'),
  ('FY26 Q3', '2025-12-01', '2026-02-28'),
  ('FY26 Q4', '2026-03-01', '2026-05-31'),
  ('FY27 Q1', '2026-06-01', '2026-08-31'),
  ('FY27 Q2', '2026-09-01', '2026-11-30'),
  ('FY27 Q3', '2026-12-01', '2027-02-28'),
  ('FY27 Q4', '2027-03-01', '2027-05-31')
ON CONFLICT (label) DO NOTHING;

-- ------------------------------------------------------------
-- Section B - activity, by classification, for any range
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_activity(p_from date, p_to date)
RETURNS TABLE (
  classification text,
  events bigint,
  attendance bigint
) AS $$
  SELECT coalesce(cd.classification::text, 'unclassified'),
         count(*),
         coalesce(sum(coalesce(r.actual_attendance, r.final_attendance,
                               r.estimated_attendance)), 0)
    FROM event_requests r
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
   WHERE r.event_date BETWEEN p_from AND p_to
     AND r.status IN ('confirmed', 'completed')
   GROUP BY 1
   ORDER BY 1;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- Sections C, D, E - cost against charge, by classification
--
-- The same arithmetic carries three names. For internal events the
-- gap is institutional support, for affiliated it is partnership
-- support, and for external it is contribution. The report labels
-- them differently because they mean different things, but the
-- calculation is one subtraction.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_financials(p_from date, p_to date)
RETURNS TABLE (
  classification text,
  events bigint,
  food_cost numeric,
  consumables_cost numeric,
  labor_cost numeric,
  other_cost numeric,
  true_cost numeric,
  charged numeric,
  gap numeric,
  labor_hours numeric,
  closed_events bigint
) AS $$
  SELECT coalesce(cd.classification::text, 'unclassified'),
         count(*),
         coalesce(sum(c.food), 0),
         coalesce(sum(c.consumables), 0),
         coalesce(sum(c.labor), 0),
         coalesce(sum(c.other_direct), 0),
         coalesce(sum(c.food + c.consumables + c.labor + c.other_direct), 0),
         coalesce(sum(coalesce(sp.estimated_charge, 0)
                      + coalesce(r.facility_charge_applied, 0)), 0),
         coalesce(sum(coalesce(sp.estimated_charge, 0)
                      + coalesce(r.facility_charge_applied, 0)), 0)
           - coalesce(sum(c.food + c.consumables + c.labor + c.other_direct), 0),
         coalesce(sum(l.hours), 0),
         count(*) FILTER (WHERE r.closed_at IS NOT NULL)
    FROM event_requests r
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
    LEFT JOIN service_paths sp
           ON sp.request_id = r.id AND sp.is_current
    LEFT JOIN LATERAL (
      SELECT
        coalesce(sum(amount) FILTER (WHERE category='food'), 0)         AS food,
        coalesce(sum(amount) FILTER (WHERE category='consumables'), 0)  AS consumables,
        coalesce(sum(amount) FILTER (WHERE category='labor'), 0)        AS labor,
        coalesce(sum(amount) FILTER (WHERE category='other_direct'), 0) AS other_direct
        FROM event_costs ec
       WHERE ec.request_id = r.id AND ec.is_actual
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(hours), 0) AS hours
        FROM labor_entries le WHERE le.request_id = r.id
    ) l ON true
   WHERE r.event_date BETWEEN p_from AND p_to
     AND r.status IN ('confirmed', 'completed')
   GROUP BY 1
   ORDER BY 1;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- Section H - lost and declined business for any range
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_lost_business(p_from date, p_to date)
RETURNS TABLE (
  reason text,
  occurrences bigint,
  revenue_lost numeric,
  referred_out bigint
) AS $$
  SELECT d.reason::text,
         count(*),
         coalesce(sum(d.estimated_revenue_lost), 0),
         count(*) FILTER (WHERE d.outside_caterer_used)
    FROM declined_business d
   WHERE d.requested_date BETWEEN p_from AND p_to
   GROUP BY 1
   ORDER BY 3 DESC NULLS LAST;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- Data quality. A report resting on half the events is worse than
-- no report, because it looks authoritative.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_completeness(p_from date, p_to date)
RETURNS TABLE (
  events_in_period bigint,
  closed_out bigint,
  with_actual_costs bigint,
  with_final_attendance bigint,
  cost_capture_pct numeric
) AS $$
  SELECT count(*),
         count(*) FILTER (WHERE r.closed_at IS NOT NULL),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM event_costs c
            WHERE c.request_id = r.id AND c.is_actual)),
         count(*) FILTER (WHERE r.final_attendance IS NOT NULL),
         round(100.0 * count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM event_costs c
            WHERE c.request_id = r.id AND c.is_actual))
           / nullif(count(*), 0), 0)
    FROM event_requests r
   WHERE r.event_date BETWEEN p_from AND p_to
     AND r.status IN ('confirmed', 'completed');
$$ LANGUAGE sql STABLE;
