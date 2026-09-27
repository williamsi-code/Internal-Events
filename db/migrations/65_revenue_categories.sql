-- ============================================================
-- Migration 65 - What kind of money each line is
--
-- The quarterly report can say what an event was charged. It cannot
-- say how much of that was food and how much was the room, because
-- nothing on a line says which it is.
--
-- Every chargeable line now carries a revenue category. Menu items
-- inherit one from their category; the facility charge is room
-- rental by definition; manual lines already had a kind and are
-- mapped across.
-- ============================================================

CREATE TYPE revenue_category AS ENUM (
  'food',
  'beverage',
  'alcohol',
  'room_rental',
  'labor',
  'equipment_rental',
  'delivery',
  'other'
);

ALTER TABLE menu_categories
  ADD COLUMN revenue_category revenue_category NOT NULL DEFAULT 'food';

-- Per item, for the ones that do not follow their category. A bar
-- package sits in a food category and is plainly alcohol.
ALTER TABLE menu_items
  ADD COLUMN revenue_category revenue_category;

COMMENT ON COLUMN menu_items.revenue_category IS
  'Overrides the category. Null means follow the category it sits in.';

-- Categories that are plainly not food.
UPDATE menu_categories SET revenue_category = 'beverage'
 WHERE name ILIKE '%beverage%'
    OR name ILIKE '%drink%'
    OR name ILIKE '%coffee%'
    OR name ILIKE '%punch%';

UPDATE menu_categories SET revenue_category = 'alcohol'
 WHERE name ILIKE '%bar%'
    OR name ILIKE '%wine%'
    OR name ILIKE '%beer%'
    OR name ILIKE '%alcohol%';

UPDATE menu_categories SET revenue_category = 'labor'
 WHERE name ILIKE '%service%'
    OR name ILIKE '%staff%'
    OR name ILIKE '%attendant%';

UPDATE menu_categories SET revenue_category = 'equipment_rental'
 WHERE name ILIKE '%rental%'
    OR name ILIKE '%linen%'
    OR name ILIKE '%china%';

-- Items whose own name gives them away.
UPDATE menu_items SET revenue_category = 'alcohol'
 WHERE name ILIKE '%bartender%'
    OR name ILIKE '%bar package%'
    OR name ILIKE '%keg%'
    OR name ILIKE '%wine service%';

UPDATE menu_items SET revenue_category = 'labor'
 WHERE name ILIKE '%server%'
    OR name ILIKE '%attendant%'
    OR name ILIKE '%staffing%'
    OR name ILIKE '%carver%';

UPDATE menu_items SET revenue_category = 'delivery'
 WHERE name ILIKE '%delivery%';

-- What a line actually is, following the override.
CREATE OR REPLACE FUNCTION line_revenue_category(p_menu_item_id uuid)
RETURNS revenue_category AS $fn$
  SELECT coalesce(mi.revenue_category, c.revenue_category)
    FROM menu_items mi
    JOIN menu_categories c ON c.id = mi.category_id
   WHERE mi.id = p_menu_item_id;
$fn$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- Manual sheet lines map across
-- ------------------------------------------------------------

ALTER TABLE sheet_lines
  ADD COLUMN revenue_category revenue_category;

UPDATE sheet_lines SET revenue_category = CASE kind
  WHEN 'food'     THEN 'food'::revenue_category
  WHEN 'labor'    THEN 'labor'::revenue_category
  WHEN 'rental'   THEN 'equipment_rental'::revenue_category
  WHEN 'delivery' THEN 'delivery'::revenue_category
  ELSE 'other'::revenue_category
END;

-- ------------------------------------------------------------
-- The breakdown
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION revenue_breakdown(p_request_id uuid)
RETURNS TABLE (category text, amount numeric) AS $fn$
  SELECT cat, round(sum(amount), 2)
    FROM (
      -- Menu lines, at whatever tier was quoted.
      SELECT line_revenue_category(sel.menu_item_id)::text AS cat,
             sel.quantity * sel.unit_price_quoted AS amount
        FROM request_menu_selections sel
       WHERE sel.request_id = p_request_id

      UNION ALL

      -- The room.
      SELECT 'room_rental',
             coalesce(r.facility_charge_applied, 0)
        FROM event_requests r
       WHERE r.id = p_request_id
         AND coalesce(r.facility_charge_applied, 0) <> 0

      UNION ALL

      -- Anything written on by hand.
      SELECT coalesce(sl.revenue_category, 'other')::text,
             CASE WHEN sl.kind = 'discount'
                  THEN -abs(sl.quantity * sl.unit_price)
                  ELSE sl.quantity * sl.unit_price END
        FROM sheet_lines sl
       WHERE sl.request_id = p_request_id
         AND sl.is_charged
    ) parts
   GROUP BY cat
  HAVING round(sum(amount), 2) <> 0
   ORDER BY cat;
$fn$ LANGUAGE sql STABLE;

-- The same, across a period, for the quarterly report.
CREATE OR REPLACE FUNCTION revenue_by_category(
  p_from date,
  p_to date
) RETURNS TABLE (
  category text,
  amount numeric,
  events integer,
  share numeric
) AS $fn$
  WITH lines AS (
    SELECT rb.category, rb.amount, r.id AS request_id
      FROM event_requests r
      CROSS JOIN LATERAL revenue_breakdown(r.id) rb
     WHERE r.event_date BETWEEN p_from AND p_to
       AND r.status IN ('confirmed', 'completed')
  ),
  totalled AS (
    SELECT category,
           sum(amount) AS amount,
           count(DISTINCT request_id)::int AS events
      FROM lines
     GROUP BY category
  )
  SELECT t.category, round(t.amount, 2), t.events,
         CASE WHEN (SELECT sum(amount) FROM totalled) > 0
              THEN round(100 * t.amount / (SELECT sum(amount) FROM totalled), 1)
              ELSE 0 END
    FROM totalled t
   ORDER BY t.amount DESC;
$fn$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- The catering sheet, one line per variety
--
-- Thirty Comfort Meals split fifteen beef and fifteen turkey is two
-- things to cook, and the kitchen needs them as two lines. Choices
-- that are not a split - a dressing, a bread - stay as a note on the
-- parent line, because they are not separate work.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION sheet_lines_for(p_request_id uuid)
RETURNS TABLE (
  selection_id uuid,
  menu_item_id uuid,
  item_name text,
  variety text,
  category_name text,
  revenue_category text,
  quantity numeric,
  unit text,
  unit_price numeric,
  line_total numeric,
  notes text,
  sort_order integer,
  is_variety boolean
) AS $fn$
  WITH splits AS (
    -- Lines where a choice group divides the order into portions.
    SELECT sel.id AS selection_id,
           sel.menu_item_id,
           mi.name AS item_name,
           o.label AS variety,
           c.name AS category_name,
           line_revenue_category(sel.menu_item_id)::text AS revenue_category,
           sc.quantity::numeric AS quantity,
           mi.unit,
           sel.unit_price_quoted AS unit_price,
           sc.quantity * sel.unit_price_quoted AS line_total,
           sel.notes,
           c.sort_order * 1000 + mi.sort_order AS sort_order,
           true AS is_variety
      FROM request_menu_selections sel
      JOIN menu_items mi ON mi.id = sel.menu_item_id
      JOIN menu_categories c ON c.id = mi.category_id
      JOIN selection_choices sc ON sc.selection_id = sel.id
      JOIN menu_choice_options o ON o.id = sc.option_id
      JOIN menu_choice_groups g ON g.id = o.group_id
                               AND g.quantity_mode = 'per_option'
     WHERE sel.request_id = p_request_id
       AND sc.quantity IS NOT NULL
  ),
  whole AS (
    -- Everything else, one line as ordered.
    SELECT sel.id, sel.menu_item_id, mi.name, NULL::text,
           c.name,
           line_revenue_category(sel.menu_item_id)::text,
           sel.quantity::numeric, mi.unit,
           sel.unit_price_quoted,
           sel.quantity * sel.unit_price_quoted,
           sel.notes,
           c.sort_order * 1000 + mi.sort_order,
           false
      FROM request_menu_selections sel
      JOIN menu_items mi ON mi.id = sel.menu_item_id
      JOIN menu_categories c ON c.id = mi.category_id
     WHERE sel.request_id = p_request_id
       AND NOT EXISTS (SELECT 1 FROM splits s WHERE s.selection_id = sel.id)
  )
  SELECT * FROM splits
  UNION ALL
  SELECT * FROM whole
  ORDER BY sort_order, variety NULLS FIRST;
$fn$ LANGUAGE sql STABLE;
