-- ============================================================
-- Migration 66 - A meal that comes with a drink should ask which
--
-- Several menu items include a beverage. The description says so and
-- nothing asks, so the kitchen guesses or rings up. A choice group
-- turns that into a question at order time, which is where the
-- requester is already thinking about it.
--
-- The groups are created from what the descriptions claim. Anything
-- this gets wrong is visible in Back office, menu, and takes a
-- moment to correct - which is better than nobody being asked at
-- all.
-- ============================================================

-- The drinks that can be included with a meal, as one reusable set.
-- Priced at zero: the drink is part of what the meal costs.
CREATE OR REPLACE FUNCTION add_included_drinks(p_item_id uuid)
RETURNS uuid AS $fn$
DECLARE
  g uuid;
BEGIN
  -- Already asked? Leave it alone.
  SELECT id INTO g FROM menu_choice_groups
   WHERE menu_item_id = p_item_id AND label = 'Drink';
  IF g IS NOT NULL THEN RETURN g; END IF;

  INSERT INTO menu_choice_groups
    (menu_item_id, label, help_text, min_select, max_select,
     quantity_mode, sort_order)
  VALUES
    (p_item_id, 'Drink', 'Included with this', 1, 1, 'per_option', 1)
  RETURNING id INTO g;

  INSERT INTO menu_choice_options (group_id, label, price_delta, sort_order)
  VALUES
    (g, 'Coffee',          0, 1),
    (g, 'Decaf coffee',    0, 2),
    (g, 'Hot tea',         0, 3),
    (g, 'Iced tea',        0, 4),
    (g, 'Lemonade',        0, 5),
    (g, 'Water',           0, 6),
    (g, 'Assorted sodas',  0, 7);

  RETURN g;
END;
$fn$ LANGUAGE plpgsql;

-- Anything whose own description says a drink comes with it.
DO $block$
DECLARE
  item record;
  n integer := 0;
BEGIN
  FOR item IN
    SELECT mi.id, mi.name
      FROM menu_items mi
      JOIN menu_categories c ON c.id = mi.category_id
     WHERE mi.is_active
       AND c.revenue_category = 'food'
       AND (
         mi.description ILIKE '%includes%beverage%'
         OR mi.description ILIKE '%includes%drink%'
         OR mi.description ILIKE '%served with%beverage%'
         OR mi.description ILIKE '%served with%drink%'
         OR mi.description ILIKE '%with your choice of beverage%'
         OR mi.description ILIKE '%includes coffee%'
         OR mi.description ILIKE '%includes tea%'
         OR mi.description ILIKE '%and a drink%'
       )
  LOOP
    PERFORM add_included_drinks(item.id);
    n := n + 1;
    RAISE NOTICE 'Drink choice added to %', item.name;
  END LOOP;

  RAISE NOTICE '% items now ask which drink', n;
END
$block$;

-- A drink choice is part of the meal rather than separate work, so
-- it stays a note on the parent line rather than splitting it.
UPDATE menu_choice_groups
   SET quantity_mode = 'per_option'
 WHERE label = 'Drink';

COMMENT ON FUNCTION add_included_drinks IS
  'Attach the standard included-drink question to a menu item. Safe to run twice.';
