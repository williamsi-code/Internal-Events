-- ============================================================
-- Migration 18 - Event close-out
--
-- The last step, and the one most likely to be skipped: the event
-- is over and everyone has moved on. Everything here is therefore
-- pre-fillable from what the system already knows, so closing out
-- is a matter of correcting numbers rather than producing them.
--
-- Without this, the reporting views from migration 05 have nothing
-- to report on: true cost, institutional support, and contribution
-- margin all depend on actual cost, which only exists once someone
-- records it.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN actual_attendance integer CHECK (actual_attendance >= 0),
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES users(id),
  ADD COLUMN closeout_notes text,
  ADD COLUMN did_not_occur boolean NOT NULL DEFAULT false;

CREATE INDEX ON event_requests (event_date)
  WHERE closed_at IS NULL;

-- Events that have happened and are still waiting to be closed out.
-- This is the list that quietly grows unless someone is shown it.
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
  sp.estimated_charge,
  coalesce(sum(sel.quantity * sel.unit_price_quoted), 0) AS quoted_total
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
LEFT JOIN service_paths sp
       ON sp.request_id = r.id AND sp.is_current
LEFT JOIN request_menu_selections sel ON sel.request_id = r.id
WHERE r.closed_at IS NULL
  AND r.event_date < CURRENT_DATE
  AND r.status NOT IN ('cancelled', 'denied', 'draft')
GROUP BY r.id, cd.classification, sp.estimated_charge
ORDER BY r.event_date;

-- ------------------------------------------------------------
-- Cost pre-fill
--
-- The internal tier is defined as food and disposables at cost, so
-- the internal price of what was ordered is a usable starting point
-- for actual food cost whatever the event was actually charged.
-- Staff correct it; they do not start from a blank field.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION suggested_food_cost(p_request_id uuid)
RETURNS numeric AS $$
  SELECT coalesce(round(sum(sel.quantity * mip.unit_price), 2), 0)
    FROM request_menu_selections sel
    JOIN menu_item_prices mip
      ON mip.menu_item_id = sel.menu_item_id
     AND mip.path = 'internal_non_revenue'
     AND mip.effective_from <= CURRENT_DATE
     AND (mip.effective_to IS NULL OR mip.effective_to > CURRENT_DATE)
   WHERE sel.request_id = p_request_id;
$$ LANGUAGE sql STABLE;

-- Closing an event marks it completed and releases the room.
CREATE OR REPLACE FUNCTION complete_on_closeout()
RETURNS trigger AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    NEW.status := CASE WHEN NEW.did_not_occur THEN 'cancelled' ELSE 'completed' END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER closeout_completes_request
  BEFORE UPDATE OF closed_at ON event_requests
  FOR EACH ROW EXECUTE FUNCTION complete_on_closeout();

-- ------------------------------------------------------------
-- What close-out produces, per event
-- ------------------------------------------------------------

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
  coalesce(sp.estimated_charge, 0)                                    AS charged,
  coalesce(sp.estimated_charge, 0) - coalesce(sum(c.amount), 0)       AS margin,
  (SELECT coalesce(sum(hours), 0) FROM labor_entries l
    WHERE l.request_id = r.id)                                        AS labor_hours,
  r.closed_at IS NOT NULL                                             AS is_closed
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
LEFT JOIN service_paths sp ON sp.request_id = r.id AND sp.is_current
LEFT JOIN event_costs c ON c.request_id = r.id AND c.is_actual
GROUP BY r.id, cd.classification, sp.estimated_charge;
