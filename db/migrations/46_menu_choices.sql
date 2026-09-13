-- ============================================================
-- Migration 46 - Choices when ordering
--
-- The menu says "bacon or sausage". Reading it, that is fine.
-- Ordering it, the kitchen needs to know which, and today the
-- requester has nowhere to say.
--
-- A choice group hangs off a menu item: a label, how many may be
-- picked, and whether a quantity is entered per option. That last
-- part is what the boxed sandwiches need - two varieties, and how
-- many of each - and what the buffets need, where the number in
-- parentheses is how many varieties are included.
--
-- Choices are ordering-time only. The published menu still reads as
-- prose, because a customer browsing does not want a form.
-- ============================================================

CREATE TYPE choice_quantity_mode AS ENUM ('none', 'per_option');

CREATE TABLE menu_choice_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  label         text NOT NULL,
  help_text     text,
  min_select    integer NOT NULL DEFAULT 1,
  max_select    integer NOT NULL DEFAULT 1,
  quantity_mode choice_quantity_mode NOT NULL DEFAULT 'none',
  sort_order    integer NOT NULL DEFAULT 0,
  CHECK (max_select >= min_select),
  CHECK (min_select >= 0)
);

CREATE INDEX ON menu_choice_groups (menu_item_id, sort_order);

CREATE TABLE menu_choice_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES menu_choice_groups(id) ON DELETE CASCADE,
  label         text NOT NULL,
  -- Per person, added to the item's unit price. Guacamole is a dollar.
  price_delta   numeric(8,2) NOT NULL DEFAULT 0,
  note          text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE INDEX ON menu_choice_options (group_id, sort_order);

-- What the requester picked. Quantity is null unless the group asks
-- for one per option.
CREATE TABLE selection_choices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id  uuid NOT NULL REFERENCES request_menu_selections(id) ON DELETE CASCADE,
  option_id     uuid NOT NULL REFERENCES menu_choice_options(id),
  quantity      integer CHECK (quantity IS NULL OR quantity > 0),
  UNIQUE (selection_id, option_id)
);

CREATE INDEX ON selection_choices (selection_id);

-- ------------------------------------------------------------
-- Helpers, because there are about forty groups to define and
-- doing it by hand invites a mismatched id.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION add_choice_group(
  p_category text,
  p_item text,
  p_label text,
  p_min integer,
  p_max integer,
  p_options text[],
  p_mode choice_quantity_mode DEFAULT 'none',
  p_help text DEFAULT NULL,
  p_sort integer DEFAULT 0
) RETURNS uuid AS $$
DECLARE
  v_item_id uuid;
  v_group_id uuid;
  v_option text;
  i integer := 0;
BEGIN
  SELECT mi.id INTO v_item_id
    FROM menu_items mi
    JOIN menu_categories c ON c.id = mi.category_id
   WHERE c.name = p_category AND mi.name = p_item;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'No menu item "%" in category "%"', p_item, p_category;
  END IF;

  DELETE FROM menu_choice_groups
   WHERE menu_item_id = v_item_id AND label = p_label;

  INSERT INTO menu_choice_groups
    (menu_item_id, label, help_text, min_select, max_select,
     quantity_mode, sort_order)
  VALUES
    (v_item_id, p_label, p_help, p_min, p_max, p_mode, p_sort)
  RETURNING id INTO v_group_id;

  FOREACH v_option IN ARRAY p_options LOOP
    i := i + 1;
    INSERT INTO menu_choice_options (group_id, label, sort_order)
    VALUES (v_group_id, v_option, i);
  END LOOP;

  RETURN v_group_id;
END;
$$ LANGUAGE plpgsql;

/** An option that costs extra, added to a group that already exists. */
CREATE OR REPLACE FUNCTION add_choice_option(
  p_group uuid,
  p_label text,
  p_delta numeric,
  p_sort integer
) RETURNS void AS $$
  INSERT INTO menu_choice_options (group_id, label, price_delta, sort_order)
  VALUES (p_group, p_label, p_delta, p_sort);
$$ LANGUAGE sql;

-- ------------------------------------------------------------
-- Corrections from the Fall 2026 card
--
-- A price row that has not taken effect yet is amended in place
-- rather than closed and reopened. Closing it would need an
-- effective_to on the same day as its effective_from, which the
-- table rightly refuses - a price cannot both start and end on the
-- same date.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_price(
  p_item text,
  p_path text,
  p_price numeric
) RETURNS void AS $$
DECLARE
  v_id uuid;
  v_existing record;
BEGIN
  SELECT id INTO v_id FROM menu_items WHERE name = p_item;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No menu item called %', p_item;
  END IF;

  SELECT id, effective_from INTO v_existing
    FROM menu_item_prices
   WHERE menu_item_id = v_id
     AND path = p_path::financial_path
     AND effective_to IS NULL
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.effective_from > CURRENT_DATE THEN
    -- Not live yet, so correct it where it stands.
    UPDATE menu_item_prices SET unit_price = p_price WHERE id = v_existing.id;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE menu_item_prices
       SET effective_to = CURRENT_DATE + 1
     WHERE id = v_existing.id;
  END IF;

  INSERT INTO menu_item_prices
    (menu_item_id, path, unit_price, effective_from)
  VALUES (v_id, p_path::financial_path, p_price, CURRENT_DATE + 1);
END;
$$ LANGUAGE plpgsql;

-- The turnover price, which the previous card left ambiguous.
UPDATE menu_items SET unit = 'per dozen', description = '12 count'
 WHERE name = 'Apple Turnovers';
SELECT set_price('Apple Turnovers', 'external_commercial', 16.00);

-- Yogurt cup went up.
SELECT set_price('Yogurt Cup', 'external_commercial', 2.50);

UPDATE menu_items SET unit = 'per person'
 WHERE name IN ('Whole Fruit', 'Yogurt Cup');

UPDATE menu_items SET unit = 'each'
 WHERE name IN ('Hashbrowns', 'Bacon', 'Sausage', 'Pancakes',
                'Biscuits and Gravy', 'Mixed Cut Fruit')
   AND category_id = (SELECT id FROM menu_categories
                       WHERE name = 'Breakfast a la carte');

-- Two items are priced per tier explicitly rather than at 60% and
-- 30% of external. Run after reapply_pricing_tiers, or the rule
-- overwrites them.
CREATE OR REPLACE FUNCTION set_tier_prices(
  p_item text,
  p_internal numeric,
  p_affiliated numeric,
  p_external numeric
) RETURNS void AS $$
BEGIN
  PERFORM set_price(p_item, 'internal_non_revenue', p_internal);
  PERFORM set_price(p_item, 'internal_revenue_generating', p_internal);
  PERFORM set_price(p_item, 'affiliated_cost_recovery', p_affiliated);
  PERFORM set_price(p_item, 'external_commercial', p_external);
END;
$$ LANGUAGE plpgsql;

SELECT set_tier_prices('Bakery Donut Holes', 4.00, 6.00, 8.00);
SELECT set_tier_prices('Bakery Dutch Letter', 3.50, 4.50, 5.50);

COMMENT ON FUNCTION set_tier_prices IS
  'For items priced per tier rather than at the standard 60% and 30% of external. Run after reapply_pricing_tiers, or the rule will overwrite it.';

-- ============================================================
-- The choices themselves
-- ============================================================

-- ---------------- Breakfast ----------------
SELECT add_choice_group('Breakfast', 'The Big Red Breakfast', 'Meat', 1, 1,
  ARRAY['Bacon', 'Sausage'], 'none', NULL, 1);
SELECT add_choice_group('Breakfast', 'The Big Red Breakfast', 'Pastry', 1, 1,
  ARRAY['Mini cinnamon roll', 'Muffin'], 'none', NULL, 2);

SELECT add_choice_group('Breakfast', 'Breakfast Croissant Sandwich', 'Meat', 1, 1,
  ARRAY['Bacon', 'Sausage', 'Ham'], 'none', NULL, 1);

SELECT add_choice_group('Breakfast', 'Breakfast Burrito', 'Meat', 1, 1,
  ARRAY['Ham', 'Sausage'], 'none', NULL, 1);

SELECT add_choice_group('Breakfast', 'Breakfast Pizza', 'Topping', 1, 1,
  ARRAY['Sausage', 'Bacon', 'Ham', 'Veggie'], 'none', NULL, 1);

SELECT add_choice_group('Breakfast', 'Breakfast Casserole, small pan', 'Variety', 1, 1,
  ARRAY['Bacon and egg', 'Sausage and egg', 'Denver', 'Veggie'], 'none', NULL, 1);
SELECT add_choice_group('Breakfast', 'Breakfast Casserole, large pan', 'Variety', 1, 1,
  ARRAY['Bacon and egg', 'Sausage and egg', 'Denver', 'Veggie'], 'none', NULL, 1);

SELECT add_choice_group('Breakfast', 'Quiche', 'Variety', 1, 1,
  ARRAY['Quiche Lorraine (ham and swiss)', 'Three cheese and spinach',
        'Bacon and cheese'], 'none', NULL, 1);

SELECT add_choice_group('Breakfast', 'Coffee Cake', 'Flavour', 1, 1,
  ARRAY['Cinnamon and sugar', 'Berry'], 'none', NULL, 1);

-- ---------------- Lunch ----------------
SELECT add_choice_group('Lunch', 'Comfort Meal', 'Meat', 1, 1,
  ARRAY['Roast beef', 'Oven roasted turkey breast'], 'none', NULL, 1);
SELECT add_choice_group('Lunch', 'Comfort Meal', 'Vegetable', 1, 1,
  ARRAY['Corn', 'Green beans'], 'none', NULL, 2);
SELECT add_choice_group('Lunch', 'Comfort Meal', 'Roll', 1, 1,
  ARRAY['White', 'Wheat'], 'none', NULL, 3);

SELECT add_choice_group('Lunch', 'Asian Lunch', 'Entrées', 2, 2,
  ARRAY['Sweet and sour chicken', 'General Tso''s chicken', 'Orange chicken',
        'Mongolian beef', 'Beef and broccoli'],
  'none', 'Choose two', 1);

SELECT add_choice_group('Lunch', 'Mexican Fiesta Bar', 'Main', 1, 1,
  ARRAY['Seasoned beef with flour tortillas and tortilla chips',
        'Chicken enchiladas'], 'none', NULL, 1);

SELECT add_choice_group('Lunch', 'Pasta Bar', 'Sauces', 2, 2,
  ARRAY['Marinara', 'Alfredo', 'Meat sauce'], 'none', 'Choose two', 1);

SELECT add_choice_group('Lunch', 'Soup and Salad Bar', 'Greens', 1, 1,
  ARRAY['Romaine', 'Mixed greens'], 'none', NULL, 1);

-- Where "up to two varieties, and how many of each" is the shape.
SELECT add_choice_group('Lunch', 'Boxed Gourmet Salad', 'Varieties', 1, 2,
  ARRAY['Chef salad on mixed greens', 'Harvest salad',
        'Grilled chicken Caesar salad',
        'Strawberry chicken romaine with raspberry vinaigrette',
        'Taco salad', 'Greek chicken salad'],
  'per_option', 'Choose up to two, and how many of each', 1);

-- ---------------- Add-ons that cost extra ----------------
DO $$
DECLARE g uuid;
BEGIN
  g := add_choice_group('Lunch', 'Chicken Burrito Bowl', 'Guacamole', 0, 1,
        ARRAY[]::text[], 'none', 'Optional', 2);
  PERFORM add_choice_option(g, 'Add guacamole', 1.00, 1);

  g := add_choice_group('Lunch', 'Fajita Steak Bowl', 'Guacamole', 0, 1,
        ARRAY[]::text[], 'none', 'Optional', 2);
  PERFORM add_choice_option(g, 'Add guacamole', 1.00, 1);

  g := add_choice_group('Lunch', 'Pasta Bar', 'Protein', 0, 1,
        ARRAY[]::text[], 'none', 'Optional', 2);
  PERFORM add_choice_option(g, 'Add chicken', 2.00, 1);
  PERFORM add_choice_option(g, 'Add meatballs', 2.00, 2);

  g := add_choice_group('Starters', 'Meatballs', 'Extra flavour', 0, 1,
        ARRAY[]::text[], 'none', 'Optional', 2);
  PERFORM add_choice_option(g, 'Add a second flavour', 2.00, 1);
END $$;

-- Boxed sandwiches and wraps become one item each with a variety
-- dropdown, rather than fifteen separate lines to hunt through.
DO $$
DECLARE
  v_cat uuid;
  v_item uuid;
BEGIN
  SELECT id INTO v_cat FROM menu_categories WHERE name = 'Lunch';

  -- Retire the individual lines; the grouped item replaces them.
  UPDATE menu_items SET is_active = false
   WHERE category_id = v_cat
     AND (name LIKE 'Boxed %on %' OR name LIKE 'Boxed % Wrap');
END $$;

SELECT upsert_menu_item('Lunch', 'Boxed Sandwiches',
  'Served with chips, a choice of pasta or potato salad, and a cookie',
  'per person', 10, 15.00, 20);
SELECT upsert_menu_item('Lunch', 'Boxed Wraps',
  'Served with chips, a choice of pasta or potato salad, and a cookie',
  'per person', 10, 14.00, 30);

-- Priced at the dearest variety so a quote is never short. Staff
-- adjust down at final review if the cheaper ones were chosen.
COMMENT ON TABLE menu_choice_options IS
  'Options within a choice group. price_delta is per person, added to the item price.';

SELECT add_choice_group('Lunch', 'Boxed Sandwiches', 'Varieties', 1, 2,
  ARRAY['BBQ pulled pork on bakery bun',
        'Grilled chicken on sourdough',
        'Dutch spiced beef on bakery bun',
        'Roast beef or turkey on hoagie',
        'Ham and cheese on croissant',
        'Italian on hoagie',
        'Philly steak on hoagie',
        'Central club on hoagie'],
  'per_option', 'Choose up to two, and how many of each', 1);

SELECT add_choice_group('Lunch', 'Boxed Sandwiches', 'Side', 1, 1,
  ARRAY['Pasta salad', 'Potato salad'], 'none', NULL, 2);

SELECT add_choice_group('Lunch', 'Boxed Wraps', 'Varieties', 1, 2,
  ARRAY['Gourmet BLT wrap', 'Club wrap', 'Caesar wrap',
        'Buffalo chicken wrap', 'Spicy honey chicken wrap',
        'Greek chicken wrap'],
  'per_option', 'Choose up to two, and how many of each', 1);

SELECT add_choice_group('Lunch', 'Boxed Wraps', 'Side', 1, 1,
  ARRAY['Pasta salad', 'Potato salad'], 'none', NULL, 2);

SELECT add_choice_group('Lunch', 'Party Sub Sandwich', 'Meats', 2, 2,
  ARRAY['Turkey', 'Ham', 'Roast beef', 'Salami'], 'none', 'Choose two', 1);

-- ---------------- Peace Street Pizza ----------------
DO $$
DECLARE g uuid;
BEGIN
  g := add_choice_group('Peace Street Pizza', 'Tossed Salad with Pizza',
        'Dressings', 2, 2,
        ARRAY['Ranch', 'Italian', 'French', 'Balsamic vinaigrette',
              'Raspberry vinaigrette', 'Caesar'],
        'none', 'Choose two', 1);
END $$;

-- ---------------- Dutch Picnic ----------------
SELECT add_choice_group('Dutch Picnic', 'Dutch Picnic, one meat and one side',
  'Meat', 1, 1,
  ARRAY['Grilled hamburgers', 'Grilled chicken breasts', 'Brats',
        'Hot dogs', 'Pulled pork', 'Pulled chicken'], 'none', NULL, 1);
SELECT add_choice_group('Dutch Picnic', 'Dutch Picnic, one meat and one side',
  'Side', 1, 1,
  ARRAY['Baked beans', 'Potato salad', 'Pasta salad', 'Cole slaw'],
  'none', NULL, 2);

SELECT add_choice_group('Dutch Picnic', 'Dutch Picnic, two meats and two sides',
  'Meats', 2, 2,
  ARRAY['Grilled hamburgers', 'Grilled chicken breasts', 'Brats',
        'Hot dogs', 'Pulled pork', 'Pulled chicken'],
  'none', 'Choose two', 1);
SELECT add_choice_group('Dutch Picnic', 'Dutch Picnic, two meats and two sides',
  'Sides', 2, 2,
  ARRAY['Baked beans', 'Potato salad', 'Pasta salad', 'Cole slaw'],
  'none', 'Choose two', 2);

-- ---------------- Desserts ----------------
SELECT add_choice_group('Desserts', 'Cookies', 'Variety', 1, 2,
  ARRAY['Chocolate chip', 'Snickerdoodle', 'Sugar',
        'Double chocolate chip', 'S''mores'],
  'per_option', 'Choose up to two, and how many of each', 1);
SELECT add_choice_group('Desserts', 'Cookies by the dozen', 'Variety', 1, 2,
  ARRAY['Chocolate chip', 'Snickerdoodle', 'Sugar',
        'Double chocolate chip', 'S''mores'],
  'per_option', 'Choose up to two, and how many dozen of each', 1);

SELECT add_choice_group('Desserts', 'Homemade Bars', 'Variety', 1, 2,
  ARRAY['Caramel bars', 'Almond bars', 'Brownies', 'Lemon bars', 'Scotcharoos'],
  'per_option', 'Choose up to two, and how many of each', 1);
SELECT add_choice_group('Desserts', 'Homemade Bars by the dozen', 'Variety', 1, 2,
  ARRAY['Caramel bars', 'Almond bars', 'Brownies', 'Lemon bars', 'Scotcharoos'],
  'per_option', 'Choose up to two, and how many dozen of each', 1);

SELECT add_choice_group('Desserts', 'Mousse in Chocolate Cups', 'Flavour', 1, 1,
  ARRAY['Raspberry', 'Chocolate', 'White chocolate'], 'none', NULL, 1);

SELECT add_choice_group('Desserts', 'Sundae Bar', 'Ice cream', 1, 1,
  ARRAY['Vanilla', 'Chocolate'], 'none', NULL, 1);

SELECT add_choice_group('Desserts', 'Half Sheet Cake', 'Cake', 1, 1,
  ARRAY['White', 'Chocolate', 'Marble'], 'none', NULL, 1);
SELECT add_choice_group('Desserts', 'Whole Sheet Cake', 'Cake', 1, 1,
  ARRAY['White', 'Chocolate', 'Marble'], 'none', NULL, 1);

SELECT add_choice_group('Desserts', 'Double Layer Cake', 'Cake', 1, 1,
  ARRAY['Double chocolate', 'Carrot', 'Red velvet'], 'none', NULL, 1);

SELECT add_choice_group('Desserts', 'Snack Mix or Trail Mix', 'Mix', 1, 1,
  ARRAY['Gardettos or Chex Mix', 'Trail mix with nuts and fruit'],
  'none', NULL, 1);

-- ---------------- Drinks ----------------
SELECT add_choice_group('Drinks', 'Coffee', 'Strength', 1, 1,
  ARRAY['Regular', 'Decaf'], 'none', NULL, 1);
SELECT add_choice_group('Drinks', 'Soda, Water or Iced Tea', 'Which', 1, 3,
  ARRAY['Soda', 'Bottled water', 'Iced tea'],
  'per_option', 'Choose which, and how many of each', 1);

-- ---------------- Starters ----------------
SELECT add_choice_group('Starters', 'Meatballs', 'Sauce', 1, 1,
  ARRAY['BBQ', 'Marinara', 'Sweet and sour'], 'none', NULL, 1);
SELECT add_choice_group('Starters', 'Naked Wings', 'Dipping sauce', 1, 1,
  ARRAY['Buffalo', 'Sweet chili', 'Ranch'], 'none', NULL, 1);

-- ---------------- Central Buffet ----------------
-- The number in parentheses on the card is how many varieties are
-- included, which is exactly max_select.

SELECT add_choice_group('Central Buffet', 'Buffet 1', 'Entrée', 1, 1,
  ARRAY['Dutch spiced beef', 'Glazed chicken breast',
        'Hickory smoked country ham', 'Oven roasted turkey breast',
        'Roasted pork loin', 'Slow cooked roast beef',
        'Chicken in mushroom and wine sauce', 'Dutch stuffed chicken',
        'Parmesan crusted baked chicken', 'Lasagna', 'Beef and noodles',
        'Chicken and rice', 'Chicken and noodles',
        'Carved prime rib (market value, priced separately)',
        'Beef tenderloin medallions (market value, priced separately)'],
  'none', 'One entrée included', 1);

SELECT add_choice_group('Central Buffet', 'Buffet 1', 'Starch', 1, 1,
  ARRAY['Baked potatoes', 'Cheddar parmesan potatoes',
        'Mashed Yukon gold potatoes', 'Red skin mashed potatoes',
        'Party potatoes', 'Roasted red potatoes',
        'Orzo with shiitake mushrooms', 'Wild rice', 'Pasta primavera'],
  'none', 'One starch included', 2);

SELECT add_choice_group('Central Buffet', 'Buffet 1', 'Vegetable', 1, 1,
  ARRAY['Asparagus with parmesan', 'Baked beans', 'Balsamic roasted carrots',
        'Broccoli au gratin', 'Corn', 'Green bean almondine',
        'Green bean casserole', 'Honey glazed carrots', 'Spicy garlic broccoli'],
  'none', 'One vegetable included', 3);

SELECT add_choice_group('Central Buffet', 'Buffet 1', 'Salads', 2, 2,
  ARRAY['Basil tomato', 'Broccoli crunch', 'Caprese salad', 'Garden rotini',
        'Cole slaw', 'Mixed greens salad', 'Potato salad',
        'Romaine with strawberries', 'Seven-layer salad', 'Dutch lettuce',
        'Caesar salad'],
  'none', 'Two salads included', 4);

SELECT add_choice_group('Central Buffet', 'Buffet 1', 'Rolls', 1, 1,
  ARRAY['White', 'Wheat'], 'none', NULL, 5);
SELECT add_choice_group('Central Buffet', 'Buffet 1', 'Drink', 1, 1,
  ARRAY['Iced tea', 'Lemonade'], 'none', NULL, 6);

SELECT add_choice_group('Central Buffet', 'Buffet 2', 'Entrées', 2, 2,
  ARRAY['Dutch spiced beef', 'Glazed chicken breast',
        'Hickory smoked country ham', 'Oven roasted turkey breast',
        'Roasted pork loin', 'Slow cooked roast beef',
        'Chicken in mushroom and wine sauce', 'Dutch stuffed chicken',
        'Parmesan crusted baked chicken', 'Lasagna', 'Beef and noodles',
        'Chicken and rice', 'Chicken and noodles',
        'Carved prime rib (market value, priced separately)',
        'Beef tenderloin medallions (market value, priced separately)'],
  'none', 'Two entrées included', 1);

SELECT add_choice_group('Central Buffet', 'Buffet 2', 'Starches', 2, 2,
  ARRAY['Baked potatoes', 'Cheddar parmesan potatoes',
        'Mashed Yukon gold potatoes', 'Red skin mashed potatoes',
        'Party potatoes', 'Roasted red potatoes',
        'Orzo with shiitake mushrooms', 'Wild rice', 'Pasta primavera'],
  'none', 'Two starches included', 2);

SELECT add_choice_group('Central Buffet', 'Buffet 2', 'Vegetables', 2, 2,
  ARRAY['Asparagus with parmesan', 'Baked beans', 'Balsamic roasted carrots',
        'Broccoli au gratin', 'Corn', 'Green bean almondine',
        'Green bean casserole', 'Honey glazed carrots', 'Spicy garlic broccoli'],
  'none', 'Two vegetables included', 3);

SELECT add_choice_group('Central Buffet', 'Buffet 2', 'Salads', 3, 3,
  ARRAY['Basil tomato', 'Broccoli crunch', 'Caprese salad', 'Garden rotini',
        'Cole slaw', 'Mixed greens salad', 'Potato salad',
        'Romaine with strawberries', 'Seven-layer salad', 'Dutch lettuce',
        'Caesar salad'],
  'none', 'Three salads included', 4);

SELECT add_choice_group('Central Buffet', 'Buffet 2', 'Rolls', 1, 1,
  ARRAY['White', 'Wheat'], 'none', NULL, 5);
SELECT add_choice_group('Central Buffet', 'Buffet 2', 'Drink', 1, 1,
  ARRAY['Iced tea', 'Lemonade'], 'none', NULL, 6);

SELECT add_choice_group('Central Buffet', 'Additional Entrée', 'Entrée', 1, 1,
  ARRAY['Dutch spiced beef', 'Glazed chicken breast',
        'Hickory smoked country ham', 'Oven roasted turkey breast',
        'Roasted pork loin', 'Slow cooked roast beef',
        'Chicken in mushroom and wine sauce', 'Dutch stuffed chicken',
        'Parmesan crusted baked chicken', 'Lasagna', 'Beef and noodles',
        'Chicken and rice', 'Chicken and noodles'],
  'none', NULL, 1);

-- The buffet choice categories existed only to record selections.
-- The dropdowns do that properly now.
UPDATE menu_items SET is_active = false
 WHERE category_id IN (
   SELECT id FROM menu_categories
    WHERE name IN ('Buffet entrées', 'Buffet starches',
                   'Buffet vegetables', 'Buffet salads')
 );

UPDATE menu_categories SET is_active = false
 WHERE name IN ('Buffet entrées', 'Buffet starches',
                'Buffet vegetables', 'Buffet salads');

-- ---------------- Soups ----------------
-- One line with a flavour dropdown rather than seven near-identical
-- items, since they are all the same price.
UPDATE menu_items SET is_active = false
 WHERE category_id = (SELECT id FROM menu_categories WHERE name = 'Soups');

SELECT upsert_menu_item('Soups', 'Soup',
  '16 eight-ounce servings per gallon', 'per gallon', NULL, 30.00, 1);

SELECT add_choice_group('Soups', 'Soup', 'Flavour', 1, 2,
  ARRAY['Cheeseburger chowder', 'Cream of broccoli', 'Chicken and rice',
        'Cream of potato', 'Chicken noodle', 'Vegetable',
        'Chili (seasonal)'],
  'per_option', 'Choose up to two, and how many gallons of each', 1);

-- ---------------- Bar service ----------------
SELECT add_choice_group('Bar service', 'Bar Set Up, on campus', 'Wine', 1, 1,
  ARRAY['House wine', 'Premium wine'], 'none', NULL, 1);
SELECT add_choice_group('Bar service', 'Bar Set Up, off campus', 'Wine', 1, 1,
  ARRAY['House wine', 'Premium wine'], 'none', NULL, 1);

SELECT reapply_pricing_tiers();

-- Explicit tier prices go back after the rule runs.
SELECT set_tier_prices('Bakery Donut Holes', 4.00, 6.00, 8.00);
SELECT set_tier_prices('Bakery Dutch Letter', 3.50, 4.50, 5.50);

DO $$
DECLARE
  groups integer;
  options integer;
  items_with integer;
BEGIN
  SELECT count(*) INTO groups FROM menu_choice_groups;
  SELECT count(*) INTO options FROM menu_choice_options;
  SELECT count(DISTINCT menu_item_id) INTO items_with FROM menu_choice_groups;

  RAISE NOTICE '% choice groups with % options across % menu items',
    groups, options, items_with;
END $$;
