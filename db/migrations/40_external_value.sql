-- ============================================================
-- Migration 40 - What an event would have cost at external rates
--
-- "Cost versus charged" only works once an event has been closed
-- out, and until close-out is habitual that leaves most of the
-- report empty.
--
-- This is the other half of the picture, and arguably the more
-- useful one: what the same order would have cost an outside
-- customer. The gap is the discount the College is granting, and it
-- can be computed the moment a menu is chosen - no close-out
-- required.
--
-- Prices are looked up as at the event date rather than today, so a
-- report run next year still shows what the rates were then.
-- ============================================================

CREATE OR REPLACE FUNCTION external_value(p_request_id uuid)
RETURNS numeric AS $$
  SELECT coalesce(
    -- The menu, at the external rate in force on the event date.
    (SELECT sum(sel.quantity * p.unit_price)
       FROM request_menu_selections sel
       JOIN event_requests r ON r.id = sel.request_id
       JOIN LATERAL (
         SELECT unit_price
           FROM menu_item_prices mp
          WHERE mp.menu_item_id = sel.menu_item_id
            AND mp.path = 'external_commercial'
            AND mp.effective_from <= r.event_date
            AND (mp.effective_to IS NULL OR mp.effective_to > r.event_date)
          ORDER BY mp.effective_from DESC
          LIMIT 1
       ) p ON true
      WHERE sel.request_id = p_request_id), 0)
  + coalesce(
    -- The room, at the external facility rate, but only where a
    -- facility charge was actually in play. Charging an internal
    -- department nothing for a room they would always have had free
    -- is not a discount.
    (SELECT CASE
              WHEN r.facility_charge_applied IS NOT NULL
                THEN s.facility_rate_external
              ELSE 0
            END
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
      WHERE r.id = p_request_id), 0);
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- Sections C, D and E with the comparison built in
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS report_financials(date, date);
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
  external_value numeric,
  discount numeric,
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
         coalesce(sum(external_value(r.id)), 0),
         -- What the College gave away by not charging external rates.
         coalesce(sum(external_value(r.id)), 0)
           - coalesce(sum(quoted_total(r.id)), 0),
         -- Charged against what it actually cost, where known.
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
-- Per event, for the explorer and for anyone asking about one
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
  external_value(r.id)                                                AS external_value,
  external_value(r.id) - quoted_total(r.id)                           AS discount,
  quoted_total(r.id) - coalesce(sum(c.amount), 0)                     AS margin,
  (SELECT coalesce(sum(hours), 0) FROM labor_entries l
    WHERE l.request_id = r.id)                                        AS labor_hours,
  r.closed_at IS NOT NULL                                             AS is_closed
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
LEFT JOIN event_costs c ON c.request_id = r.id AND c.is_actual
GROUP BY r.id, cd.classification;

DO $$
DECLARE
  charged numeric;
  ext numeric;
BEGIN
  SELECT coalesce(sum(quoted_total(id)), 0),
         coalesce(sum(external_value(id)), 0)
    INTO charged, ext
    FROM event_requests
   WHERE status IN ('confirmed', 'completed');

  RAISE NOTICE 'Across all confirmed events: charged %, external value %, discount %',
    charged, ext, ext - charged;
END $$;
