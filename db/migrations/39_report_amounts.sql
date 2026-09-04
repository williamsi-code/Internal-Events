-- ============================================================
-- Migration 39 - Make the reports read the real charge
--
-- report_financials read service_paths.estimated_charge, which
-- nothing ever writes to. Every event therefore showed zero
-- charged, which made contribution look like a straight loss and
-- institutional support look like nothing at all.
--
-- The real figure is the sum of the menu selections at the price
-- quoted, plus any facility charge. That is what the requester was
-- shown and what the invoice follows, so it is what the report
-- should use.
--
-- The views are dropped and recreated rather than replaced:
-- Postgres will not let CREATE OR REPLACE change a column's type,
-- and numeric(10,2) is becoming plain numeric.
-- ============================================================

-- One definition of "what this event was quoted", used everywhere
-- so the report, the explorer and the close-out screen cannot
-- disagree with each other.
CREATE OR REPLACE FUNCTION quoted_total(p_request_id uuid)
RETURNS numeric AS $$
  SELECT coalesce(
    (SELECT sum(sel.quantity * sel.unit_price_quoted)
       FROM request_menu_selections sel
      WHERE sel.request_id = p_request_id), 0)
  + coalesce(
    (SELECT r.facility_charge_applied
       FROM event_requests r WHERE r.id = p_request_id), 0)
  + coalesce(
    (SELECT sp.estimated_charge
       FROM service_paths sp
      WHERE sp.request_id = p_request_id AND sp.is_current), 0);
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- Sections C, D, E
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
         coalesce(sum(quoted_total(r.id)), 0),
         coalesce(sum(quoted_total(r.id)), 0)
           - coalesce(sum(c.food + c.consumables + c.labor + c.other_direct), 0),
         coalesce(sum(l.hours), 0),
         count(*) FILTER (WHERE r.closed_at IS NOT NULL)
    FROM event_requests r
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
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
-- Per-event outcome
-- ------------------------------------------------------------

DROP VIEW IF EXISTS event_outcome;

CREATE VIEW event_outcome AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  cd.classification,
  coalesce(r.actual_attendance, r.final_attendance, r.estimated_attendance)
    AS attendance,
  coalesce(sum(c.amount) FILTER (WHERE c.category='food'), 0)         AS food_cost,
  coalesce(sum(c.amount) FILTER (WHERE c.category='consumables'), 0)  AS consumables_cost,
  coalesce(sum(c.amount) FILTER (WHERE c.category='labor'), 0)        AS labor_cost,
  coalesce(sum(c.amount) FILTER (WHERE c.category='other_direct'), 0) AS other_cost,
  coalesce(sum(c.amount), 0)                                          AS true_cost,
  quoted_total(r.id)                                                  AS charged,
  quoted_total(r.id) - coalesce(sum(c.amount), 0)                     AS margin,
  (SELECT coalesce(sum(hours), 0) FROM labor_entries l
    WHERE l.request_id = r.id)                                        AS labor_hours,
  r.closed_at IS NOT NULL                                             AS is_closed
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
LEFT JOIN event_costs c ON c.request_id = r.id AND c.is_actual
GROUP BY r.id, cd.classification;

-- ------------------------------------------------------------
-- Awaiting close-out
-- ------------------------------------------------------------

DROP VIEW IF EXISTS awaiting_closeout;

CREATE VIEW awaiting_closeout AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  (CURRENT_DATE - r.event_date) AS days_since,
  coalesce(r.final_attendance, r.estimated_attendance) AS expected_attendance,
  r.department_org,
  cd.classification,
  quoted_total(r.id) AS estimated_charge,
  quoted_total(r.id) AS quoted_total
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
WHERE r.closed_at IS NULL
  AND r.event_date < CURRENT_DATE
  AND r.status NOT IN ('cancelled', 'denied', 'draft')
ORDER BY r.event_date;

-- ------------------------------------------------------------
-- What a period is worth before close-out, so a confirmed event
-- that has not happened yet still shows a value
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_pipeline(p_from date, p_to date)
RETURNS TABLE (
  classification text,
  events bigint,
  quoted numeric,
  costed_events bigint
) AS $$
  SELECT coalesce(cd.classification::text, 'unclassified'),
         count(*),
         coalesce(sum(quoted_total(r.id)), 0),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM event_costs c
            WHERE c.request_id = r.id AND c.is_actual))
    FROM event_requests r
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
   WHERE r.event_date BETWEEN p_from AND p_to
     AND r.status IN ('confirmed', 'completed')
   GROUP BY 1
   ORDER BY 1;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  n integer;
  total numeric;
BEGIN
  SELECT count(*), coalesce(sum(quoted_total(id)), 0)
    INTO n, total
    FROM event_requests
   WHERE status IN ('confirmed', 'completed');

  RAISE NOTICE '% confirmed or completed events, quoted total %', n, total;

  IF n > 0 AND total = 0 THEN
    RAISE NOTICE 'Every event still totals zero. Check that menu selections exist - an event with no menu chosen has nothing to charge for.';
  END IF;
END $$;
