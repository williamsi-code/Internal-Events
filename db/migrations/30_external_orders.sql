-- ============================================================
-- Migration 30 - External ordering
--
-- An outside customer orders directly rather than asking for a
-- quote: they pick a date, a space and a menu, and submit. Staff
-- still classify, check capacity and confirm - the difference is
-- what the customer does first, not what the office does after.
--
-- Ordering at external rates is safe because external is the
-- highest tier. If staff reclassify to affiliated or internal the
-- price falls, which is a pleasant surprise rather than a dispute.
-- ============================================================

CREATE TYPE submission_route AS ENUM (
  'internal_intake',   -- the Central department flow
  'external_order',    -- the public ordering flow
  'staff_entered',     -- taken over the phone and keyed in
  'enquiry_converted'  -- began as a general enquiry
);

ALTER TABLE event_requests
  ADD COLUMN submitted_via submission_route NOT NULL
    DEFAULT 'internal_intake';

-- Everything already here came through the internal form.
UPDATE event_requests SET submitted_via = 'internal_intake';

CREATE INDEX ON event_requests (submitted_via, status);

-- ------------------------------------------------------------
-- The menu, priced for someone who has no request yet.
--
-- The ordering page needs prices before an event exists, so it
-- cannot resolve a tier from a classification. External is the
-- published rate and the correct default for an outside customer.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public_menu()
RETURNS TABLE (
  id uuid,
  category text,
  category_sort integer,
  name text,
  description text,
  unit text,
  minimum_quantity integer,
  allergen_notes text,
  unit_price numeric,
  sort_order integer
) AS $$
  SELECT mi.id, c.name, c.sort_order, mi.name, mi.description,
         mi.unit, mi.minimum_quantity, mi.allergen_notes,
         p.unit_price, mi.sort_order
    FROM menu_items mi
    JOIN menu_categories c ON c.id = mi.category_id
    JOIN menu_item_prices p
      ON p.menu_item_id = mi.id
     AND p.path = 'external_commercial'
     AND p.effective_from <= CURRENT_DATE
     AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
   WHERE mi.is_active AND c.is_active
   ORDER BY c.sort_order, mi.sort_order;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- An external order arrives with its menu already chosen, so the
-- selections are written at submission rather than at the details
-- step. This records that they were quoted before classification,
-- which is why a later reclassification changes the price.
-- ------------------------------------------------------------

ALTER TABLE request_menu_selections
  ADD COLUMN quoted_before_classification boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN request_menu_selections.quoted_before_classification IS
  'True when the customer chose from published external rates before staff classified the event. Reclassification will reprice these.';

-- Reprice an order after classification, keeping the quantities.
CREATE OR REPLACE FUNCTION reprice_selections(p_request_id uuid)
RETURNS integer AS $$
DECLARE
  tier financial_path;
  n integer;
BEGIN
  SELECT CASE
           WHEN cd.classification = 'internal' AND f.revenue_collected
             THEN cp.revenue_path
           ELSE cp.path
         END
    INTO tier
    FROM event_requests r
    JOIN classification_decisions cd
      ON cd.request_id = r.id AND cd.is_current
    JOIN classification_pricing cp
      ON cp.classification = cd.classification
    LEFT JOIN event_funding f ON f.request_id = r.id
   WHERE r.id = p_request_id;

  IF tier IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE request_menu_selections sel
     SET unit_price_quoted = p.unit_price,
         quoted_before_classification = false
    FROM menu_item_prices p
   WHERE sel.request_id = p_request_id
     AND p.menu_item_id = sel.menu_item_id
     AND p.path = tier
     AND p.effective_from <= CURRENT_DATE
     AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- Reprice automatically when a classification is recorded, so an
-- external order that turns out to be affiliated is corrected
-- without anyone remembering to do it.
CREATE OR REPLACE FUNCTION classification_reprices_order()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM request_menu_selections
     WHERE request_id = NEW.request_id
       AND quoted_before_classification
  ) THEN
    PERFORM reprice_selections(NEW.request_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reprice_on_classification
  AFTER INSERT ON classification_decisions
  FOR EACH ROW EXECUTE FUNCTION classification_reprices_order();
