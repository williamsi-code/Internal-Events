-- ============================================================
-- Migration 27 - Tiered pricing and headcount deadline
--
-- The published menu is the external rate. Affiliated events pay
-- 60% of it, internal events 30%.
--
-- Prices are versioned rows, so a quote given in September still
-- shows September's price after the percentages change. That means
-- rows opened earlier today cannot simply be closed today: the
-- constraint requires effective_to to be strictly after
-- effective_from. Rows that started today are removed outright -
-- they were opened by migration 25 and nothing has been quoted
-- from them - while genuinely older rows are closed properly.
--
-- Also reverts the headcount deadline to ten days.
--
-- NOTE: the published menu states final counts are due SEVEN days
-- before the event. This sets the system to ten at Central's
-- direction. If the menu is not updated to match, a requester
-- reading it will work to seven while the system chases at ten.
-- ============================================================

-- ------------------------------------------------------------
-- Ten days
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_headcount_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.headcount_due_on IS NULL AND NEW.event_date IS NOT NULL THEN
    NEW.headcount_due_on := NEW.event_date - INTERVAL '10 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION shift_headcount_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_date IS DISTINCT FROM OLD.event_date
     AND NEW.headcount_submitted_at IS NULL THEN
    NEW.headcount_due_on := NEW.event_date - INTERVAL '10 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE event_requests
   SET headcount_due_on = event_date - INTERVAL '10 days'
 WHERE headcount_submitted_at IS NULL
   AND event_date >= CURRENT_DATE;

UPDATE content_pages
   SET body = replace(body, 'seven days before the event',
                            'ten days before the event'),
       updated_at = now()
 WHERE body LIKE '%seven days before the event%';

-- ------------------------------------------------------------
-- Tier definitions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pricing_tiers (
  path        financial_path PRIMARY KEY,
  multiplier  numeric(5,4) NOT NULL CHECK (multiplier > 0),
  label       text NOT NULL,
  note        text
);

INSERT INTO pricing_tiers (path, multiplier, label, note) VALUES
  ('external_commercial',        1.0000, 'External',
   'The published menu price.'),
  ('affiliated_cost_recovery',   0.6000, 'Affiliated',
   'Sixty percent of the published rate.'),
  ('internal_non_revenue',       0.3000, 'Internal',
   'Thirty percent of the published rate.'),
  ('internal_revenue_generating',0.3000, 'Internal, ticketed',
   'Currently the same as internal. Raise this if an internal event that collects revenue should pay more.')
ON CONFLICT (path) DO UPDATE
  SET multiplier = EXCLUDED.multiplier,
      label = EXCLUDED.label,
      note = EXCLUDED.note;

-- ------------------------------------------------------------
-- Apply the percentages
-- ------------------------------------------------------------

-- Rows opened today by the menu load: remove rather than close,
-- since closing them today would leave a zero-length window.
DELETE FROM menu_item_prices
 WHERE path <> 'external_commercial'
   AND effective_from >= CURRENT_DATE;

-- Anything genuinely older is closed as of today, preserving the
-- history of what it used to cost.
UPDATE menu_item_prices
   SET effective_to = CURRENT_DATE
 WHERE path <> 'external_commercial'
   AND effective_from < CURRENT_DATE
   AND (effective_to IS NULL OR effective_to > CURRENT_DATE);

INSERT INTO menu_item_prices (menu_item_id, path, unit_price, effective_from)
SELECT e.menu_item_id,
       t.path,
       round(e.unit_price * t.multiplier, 2),
       CURRENT_DATE
  FROM (
    SELECT p.menu_item_id, p.unit_price
      FROM menu_item_prices p
     WHERE p.path = 'external_commercial'
       AND p.effective_from <= CURRENT_DATE
       AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
  ) e
  CROSS JOIN pricing_tiers t
 WHERE t.path <> 'external_commercial';

-- Facility rates follow the same shape.
UPDATE spaces
   SET facility_rate_affiliated = round(facility_rate_external * 0.60, 2),
       facility_rate_internal   = round(facility_rate_external * 0.30, 2)
 WHERE facility_rate_external > 0;

-- ------------------------------------------------------------
-- Reapply after a menu update
--
-- New prices open tomorrow rather than today, so anything quoted
-- today keeps the figure the requester was shown.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION reapply_pricing_tiers()
RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  -- Already-future rows are replaced outright; current rows are
  -- closed at end of today.
  DELETE FROM menu_item_prices
   WHERE path <> 'external_commercial'
     AND effective_from > CURRENT_DATE;

  UPDATE menu_item_prices
     SET effective_to = CURRENT_DATE + 1
   WHERE path <> 'external_commercial'
     AND effective_from <= CURRENT_DATE
     AND (effective_to IS NULL OR effective_to > CURRENT_DATE + 1);

  INSERT INTO menu_item_prices (menu_item_id, path, unit_price, effective_from)
  SELECT e.menu_item_id, t.path,
         round(e.unit_price * t.multiplier, 2),
         CURRENT_DATE + 1
    FROM (
      SELECT p.menu_item_id, p.unit_price
        FROM menu_item_prices p
       WHERE p.path = 'external_commercial'
         AND p.effective_from <= CURRENT_DATE + 1
         AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE + 1)
    ) e
    CROSS JOIN pricing_tiers t
   WHERE t.path <> 'external_commercial';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------

DO $$
DECLARE
  ext numeric;
  aff numeric;
  int_p numeric;
BEGIN
  SELECT max(p.unit_price) FILTER (WHERE p.path = 'external_commercial'),
         max(p.unit_price) FILTER (WHERE p.path = 'affiliated_cost_recovery'),
         max(p.unit_price) FILTER (WHERE p.path = 'internal_non_revenue')
    INTO ext, aff, int_p
    FROM menu_item_prices p
    JOIN menu_items mi ON mi.id = p.menu_item_id
   WHERE mi.name = 'The Big Red Breakfast'
     AND p.effective_from <= CURRENT_DATE
     AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE);

  IF ext IS NULL THEN
    RAISE EXCEPTION 'Could not verify pricing: menu item not found';
  END IF;

  RAISE NOTICE 'Big Red Breakfast: external %, affiliated %, internal %',
    ext, aff, int_p;

  IF aff IS DISTINCT FROM round(ext * 0.6, 2)
     OR int_p IS DISTINCT FROM round(ext * 0.3, 2) THEN
    RAISE EXCEPTION 'Tier arithmetic did not apply correctly';
  END IF;
END $$;
