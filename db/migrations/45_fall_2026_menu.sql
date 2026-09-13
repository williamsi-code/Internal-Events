-- ============================================================
-- Migration 45 - Fall 2026 menu
--
-- Replaces the menu with the Fall 2026 card.
--
-- Nothing is deleted. Items no longer offered are deactivated, so a
-- confirmed event that ordered one still shows what it ordered. A
-- changed price closes the current row and opens a new one from
-- tomorrow, so a quote given yesterday is still explicable.
--
-- Prices here are the published external rate. Affiliated and
-- internal derive from it at 60% and 30% via reapply_pricing_tiers()
-- at the end.
-- ============================================================

-- A helper, because doing this by hand 130 times invites a typo that
-- silently prices something wrong.
CREATE OR REPLACE FUNCTION upsert_menu_item(
  p_category    text,
  p_name        text,
  p_description text,
  p_unit        text,
  p_minimum     integer,
  p_price       numeric,
  p_sort        integer,
  p_allergens   text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_category_id uuid;
  v_item_id     uuid;
  v_current     numeric;
BEGIN
  SELECT id INTO v_category_id FROM menu_categories WHERE name = p_category;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'No menu category called %', p_category;
  END IF;

  SELECT id INTO v_item_id
    FROM menu_items
   WHERE category_id = v_category_id AND name = p_name;

  IF v_item_id IS NULL THEN
    INSERT INTO menu_items
      (category_id, name, description, unit, minimum_quantity,
       allergen_notes, is_active, sort_order)
    VALUES
      (v_category_id, p_name, p_description, p_unit, p_minimum,
       p_allergens, true, p_sort)
    RETURNING id INTO v_item_id;
  ELSE
    UPDATE menu_items
       SET description = p_description,
           unit = p_unit,
           minimum_quantity = p_minimum,
           allergen_notes = p_allergens,
           is_active = true,
           sort_order = p_sort
     WHERE id = v_item_id;
  END IF;

  -- Only write a price row if the price actually changed. Otherwise
  -- every menu update would fill the history with duplicates.
  SELECT unit_price INTO v_current
    FROM menu_item_prices
   WHERE menu_item_id = v_item_id
     AND path = 'external_commercial'
     AND effective_from <= CURRENT_DATE
     AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_current IS NULL OR abs(v_current - p_price) >= 0.005 THEN
    UPDATE menu_item_prices
       SET effective_to = CURRENT_DATE + 1
     WHERE menu_item_id = v_item_id
       AND path = 'external_commercial'
       AND effective_to IS NULL;

    INSERT INTO menu_item_prices
      (menu_item_id, path, unit_price, effective_from)
    VALUES
      (v_item_id, 'external_commercial', p_price, CURRENT_DATE + 1);
  END IF;

  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Everything off, then the new card back on. Anything not named
-- below stays deactivated, which is the honest outcome for an item
-- that is no longer offered.
-- ------------------------------------------------------------

UPDATE menu_items SET is_active = false;

INSERT INTO menu_categories (name, description, sort_order, is_active) VALUES
  ('Breakfast', 'All prices are per person unless otherwise noted', 1, true),
  ('Breakfast a la carte', NULL, 2, true),
  ('Lunch', 'All prices are per person unless otherwise noted', 3, true),
  ('Soups', '16 eight-ounce servings per gallon', 4, true),
  ('Lunch a la carte', 'Per person, minimum of 10 servings each', 5, true),
  ('Peace Street Pizza', 'Available for parties under 60', 6, true),
  ('Dutch Picnic', 'Served with bakery buns, condiments and paper products', 7, true),
  ('Central Buffet', 'Includes china, all table service, and linens for events at Central College', 8, true),
  ('Buffet entrées', 'Choose from these with a Central Buffet', 9, true),
  ('Buffet starches', 'Choose from these with a Central Buffet', 10, true),
  ('Buffet vegetables', 'Choose from these with a Central Buffet', 11, true),
  ('Buffet salads', 'Choose from these with a Central Buffet', 12, true),
  ('Starters', 'Prices serve 12 guests unless otherwise noted', 13, true),
  ('Desserts', NULL, 14, true),
  ('Drinks', NULL, 15, true),
  ('Bar service', NULL, 16, true),
  ('Carry out', 'Available for pick up only', 17, true)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- ---------------- Breakfast ----------------
SELECT upsert_menu_item('Breakfast', 'The Big Red Breakfast',
  'Scrambled eggs, grilled hash browns, bacon or sausage, fresh cut fruit, mini cinnamon roll or muffin, and coffee',
  'per person', 10, 13.00, 1);
SELECT upsert_menu_item('Breakfast', 'Continental Breakfast',
  'Assorted muffins, mini cinnamon rolls, and apple turnovers, fresh cut fruit and coffee',
  'per person', 10, 10.00, 2);
SELECT upsert_menu_item('Breakfast', 'Healthy Choice',
  'Fresh cut fruit, yogurt, granola, berries, slivered almonds, and coffee',
  'per person', 10, 8.00, 3);
SELECT upsert_menu_item('Breakfast', 'Breakfast Croissant Sandwich',
  'Bacon, sausage or ham with egg and cheese', 'per person', 10, 8.00, 4);
SELECT upsert_menu_item('Breakfast', 'Breakfast Burrito',
  'Scrambled eggs, ham or sausage, mushrooms, peppers, onions and cheese rolled in a tortilla',
  'per person', 10, 8.00, 5);
SELECT upsert_menu_item('Breakfast', 'Breakfast Pizza',
  'Choice of sausage, bacon, ham or veggie. 14 squares', 'each', NULL, 18.00, 6);
SELECT upsert_menu_item('Breakfast', 'Gluten Free Flat Bread Breakfast Pizza',
  'Serves 8', 'each', NULL, 15.00, 7, 'Gluten free');
SELECT upsert_menu_item('Breakfast', 'Breakfast Casserole, small pan',
  'Serves 12. Bacon and egg, sausage and egg, Denver, or veggie', 'per pan', NULL, 40.00, 8);
SELECT upsert_menu_item('Breakfast', 'Breakfast Casserole, large pan',
  'Serves 24. Bacon and egg, sausage and egg, Denver, or veggie', 'per pan', NULL, 75.00, 9);
SELECT upsert_menu_item('Breakfast', 'Quiche',
  'Serves 6. Quiche Lorraine (ham and swiss), three cheese and spinach, or bacon and cheese',
  'each', NULL, 25.00, 10);
SELECT upsert_menu_item('Breakfast', 'Coffee Cake',
  'Serves 18. Cinnamon and sugar or berry', 'each', NULL, 27.00, 11);

-- ---------------- Breakfast a la carte ----------------
SELECT upsert_menu_item('Breakfast a la carte', 'Hashbrowns', 'Serves 10', 'per tray', NULL, 17.00, 1);
SELECT upsert_menu_item('Breakfast a la carte', 'Bacon', 'Serves 10, three per person', 'per tray', NULL, 29.00, 2);
SELECT upsert_menu_item('Breakfast a la carte', 'Sausage', 'Serves 10, three per person', 'per tray', NULL, 29.00, 3);
SELECT upsert_menu_item('Breakfast a la carte', 'Pancakes', 'Serves 10, one per person', 'per tray', NULL, 20.00, 4);
SELECT upsert_menu_item('Breakfast a la carte', 'Biscuits and Gravy', 'Serves 10, one per person', 'per tray', NULL, 30.00, 5);
SELECT upsert_menu_item('Breakfast a la carte', 'Mixed Cut Fruit', 'Serves 10', 'per tray', NULL, 22.00, 6);
SELECT upsert_menu_item('Breakfast a la carte', 'Whole Fruit', NULL, 'each', NULL, 1.50, 7);
SELECT upsert_menu_item('Breakfast a la carte', 'Yogurt Cup', NULL, 'each', NULL, 2.00, 8);
SELECT upsert_menu_item('Breakfast a la carte', 'Muffins', '12 count', 'per dozen', NULL, 18.00, 9);
SELECT upsert_menu_item('Breakfast a la carte', 'Cinnamon Rolls', '12 count', 'per dozen', NULL, 16.00, 10);
SELECT upsert_menu_item('Breakfast a la carte', 'Apple Turnovers', 'CHECK THIS PRICE: the menu card reads "12 count - $2.00", which does not match the other bakery items',
  'each', NULL, 2.00, 11);
SELECT upsert_menu_item('Breakfast a la carte', 'Bakery Donut Holes', 'One dozen', 'per dozen', NULL, 6.00, 12);
SELECT upsert_menu_item('Breakfast a la carte', 'Bakery Dutch Letter', NULL, 'each', NULL, 3.00, 13);

-- ---------------- Lunch ----------------
SELECT upsert_menu_item('Lunch', 'Lasagna, small pan',
  'Serves 12. Homemade lasagna with tossed salad, dressings, and garlic bread', 'per pan', NULL, 60.00, 1);
SELECT upsert_menu_item('Lunch', 'Lasagna, large pan',
  'Serves 24. Homemade lasagna with tossed salad, dressings, and garlic bread', 'per pan', NULL, 120.00, 2);
SELECT upsert_menu_item('Lunch', 'Comfort Meal',
  'Roast beef or oven roasted turkey breast with mashed potatoes, gravy, corn or green beans, white or wheat roll',
  'per person', 10, 16.00, 3);
SELECT upsert_menu_item('Lunch', 'Asian Lunch',
  'Choose two: sweet and sour chicken, General Tso''s chicken, orange chicken, Mongolian beef or beef and broccoli. Served with jasmine rice and an egg roll',
  'per person', 10, 18.00, 4);
SELECT upsert_menu_item('Lunch', 'Mexican Fiesta Bar',
  'Seasoned beef with two flour tortillas per person and tortilla chips, or chicken enchiladas with lettuce, cheese, tomatoes, salsa and sour cream. Served with Mexican rice and refried beans',
  'per person', 10, 18.00, 5);
SELECT upsert_menu_item('Lunch', 'Chicken Burrito Bowl',
  'Shredded seasoned chicken with jasmine rice, diced tomatoes, black beans, southwest corn, shredded cheese, salsa, and sour cream. Guacamole available for an additional $1 per person',
  'per person', 10, 16.00, 6);
SELECT upsert_menu_item('Lunch', 'Fajita Steak Bowl',
  'Cilantro lime rice, grilled peppers and onions, southwest corn, diced tomato, shredded cheese, salsa and sour cream. Guacamole available for an additional $1 per person',
  'per person', 10, 17.00, 7);
SELECT upsert_menu_item('Lunch', 'Pasta Bar',
  'Penne pasta with a choice of two sauces: marinara, alfredo or meat sauce. Served with side salad and garlic bread. Chicken or meatballs for an additional $2 per person',
  'per person', 10, 16.00, 8);
SELECT upsert_menu_item('Lunch', 'Potato Bar',
  'Baked potato with taco meat, ham, broccoli and cheese sauce with sour cream, salsa, and bacon bits',
  'per person', 10, 16.00, 9);
SELECT upsert_menu_item('Lunch', 'Deli Buffet',
  'Turkey, ham, roast beef, Swiss and colby jack cheese, lettuce, tomato, assorted breads, pasta or potato salad and chips',
  'per person', 10, 18.00, 10);
SELECT upsert_menu_item('Lunch', 'Soup and Salad Bar',
  'Romaine or mixed greens with ham, turkey, hard-boiled egg, tomatoes, cucumbers, sliced red onion, broccoli, shredded cheese, cottage cheese, bacon bits, black olives, croutons and assorted dressings, and a cup of soup',
  'per person', 10, 15.00, 11);
SELECT upsert_menu_item('Lunch', 'Boxed Gourmet Salad',
  'Chef salad on mixed greens, harvest salad, grilled chicken Caesar, strawberry chicken romaine with raspberry vinaigrette, taco salad, or Greek chicken salad',
  'per person', 10, 14.00, 12);

-- Boxed sandwiches, served with chips, pasta or potato salad and a cookie
SELECT upsert_menu_item('Lunch', 'Boxed BBQ Pulled Pork on Bakery Bun',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 14.00, 20);
SELECT upsert_menu_item('Lunch', 'Boxed Grilled Chicken on Sourdough',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 14.00, 21);
SELECT upsert_menu_item('Lunch', 'Boxed Dutch Spiced Beef on Bakery Bun',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 15.00, 22);
SELECT upsert_menu_item('Lunch', 'Boxed Roast Beef or Turkey on Hoagie',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 11.00, 23);
SELECT upsert_menu_item('Lunch', 'Boxed Ham and Cheese on Croissant',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 11.00, 24);
SELECT upsert_menu_item('Lunch', 'Boxed Italian on Hoagie',
  'Ham, salami and pepperoni. Served with chips and choice of pasta or potato salad and a cookie',
  'per person', 10, 14.00, 25);
SELECT upsert_menu_item('Lunch', 'Boxed Philly Steak on Hoagie',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 15.00, 26);
SELECT upsert_menu_item('Lunch', 'Boxed Central Club on Hoagie',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 14.00, 27);

SELECT upsert_menu_item('Lunch', 'Boxed Gourmet BLT Wrap',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 13.00, 30);
SELECT upsert_menu_item('Lunch', 'Boxed Club Wrap',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 14.00, 31);
SELECT upsert_menu_item('Lunch', 'Boxed Caesar Wrap',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 13.00, 32);
SELECT upsert_menu_item('Lunch', 'Boxed Buffalo Chicken Wrap',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 13.00, 33);
SELECT upsert_menu_item('Lunch', 'Boxed Spicy Honey Chicken Wrap',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 14.00, 34);
SELECT upsert_menu_item('Lunch', 'Boxed Greek Chicken Wrap',
  'Served with chips and choice of pasta or potato salad and a cookie', 'per person', 10, 14.00, 35);

SELECT upsert_menu_item('Lunch', 'Party Sub Sandwich',
  'Three feet, serves 15. Choose two meats: turkey, ham, roast beef, or salami. Lettuce, tomato, pickles and onions, American and Swiss cheese, mayo and mustard packets',
  'each', NULL, 40.00, 40);

-- ---------------- Soups ----------------
SELECT upsert_menu_item('Soups', 'Cheeseburger Chowder', '16 eight-ounce servings', 'per gallon', NULL, 30.00, 1);
SELECT upsert_menu_item('Soups', 'Cream of Broccoli', '16 eight-ounce servings', 'per gallon', NULL, 30.00, 2);
SELECT upsert_menu_item('Soups', 'Chicken and Rice', '16 eight-ounce servings', 'per gallon', NULL, 30.00, 3);
SELECT upsert_menu_item('Soups', 'Cream of Potato', '16 eight-ounce servings', 'per gallon', NULL, 30.00, 4);
SELECT upsert_menu_item('Soups', 'Chicken Noodle', '16 eight-ounce servings', 'per gallon', NULL, 30.00, 5);
SELECT upsert_menu_item('Soups', 'Vegetable', '16 eight-ounce servings', 'per gallon', NULL, 30.00, 6);
SELECT upsert_menu_item('Soups', 'Chili', 'Seasonal. 16 eight-ounce servings', 'per gallon', NULL, 30.00, 7);

-- ---------------- Lunch a la carte ----------------
SELECT upsert_menu_item('Lunch a la carte', 'Pasta Salad', NULL, 'per person', 10, 2.00, 1);
SELECT upsert_menu_item('Lunch a la carte', 'Potato Salad', NULL, 'per person', 10, 2.00, 2);
SELECT upsert_menu_item('Lunch a la carte', 'Cole Slaw', NULL, 'per person', 10, 2.00, 3);
SELECT upsert_menu_item('Lunch a la carte', 'Baked Beans', NULL, 'per person', 10, 2.00, 4);
SELECT upsert_menu_item('Lunch a la carte', 'Party Potatoes', NULL, 'per person', 10, 2.50, 5);
SELECT upsert_menu_item('Lunch a la carte', 'Side Salad', NULL, 'per person', 10, 3.50, 6);
SELECT upsert_menu_item('Lunch a la carte', 'Assorted Chips', 'Individual bags', 'per bag', NULL, 2.00, 7);

-- ---------------- Peace Street Pizza ----------------
SELECT upsert_menu_item('Peace Street Pizza', 'Cheese Pizza',
  'Large 16 inch, 12 slices. Blend of mozzarella, cheddar and parmesan', 'each', NULL, 18.00, 1);
SELECT upsert_menu_item('Peace Street Pizza', 'Pepperoni Pizza', 'Large 16 inch, 12 slices', 'each', NULL, 19.00, 2);
SELECT upsert_menu_item('Peace Street Pizza', 'Vegetable Pizza',
  'Large 16 inch, 12 slices. Mushrooms, onions, green and red bell peppers and black olives', 'each', NULL, 19.00, 3);
SELECT upsert_menu_item('Peace Street Pizza', 'Big Red Pizza',
  'Large 16 inch, 12 slices. Pella bologna, pepperoni, sausage, Canadian bacon, onions, mushrooms, green bell peppers and black olives',
  'each', NULL, 23.00, 4);
SELECT upsert_menu_item('Peace Street Pizza', 'Meat Lovers Pizza',
  'Large 16 inch, 12 slices. Pella bologna, pepperoni, sausage, Canadian bacon', 'each', NULL, 22.00, 5);
SELECT upsert_menu_item('Peace Street Pizza', 'Supreme Pizza',
  'Large 16 inch, 12 slices. Pepperoni, sausage, Canadian bacon, bell peppers, onions and mushrooms',
  'each', NULL, 22.00, 6);
SELECT upsert_menu_item('Peace Street Pizza', 'Gluten Free Flat Bread Cheese Pizza',
  'Serves 8', 'each', NULL, 15.00, 7, 'Gluten free');
SELECT upsert_menu_item('Peace Street Pizza', 'Tossed Salad with Pizza',
  'Two dressings', 'per person', 10, 4.00, 8);

-- ---------------- Dutch Picnic ----------------
SELECT upsert_menu_item('Dutch Picnic', 'Dutch Picnic, one meat and one side',
  'Meats: grilled hamburgers, grilled chicken breasts, brats, hot dogs, pulled pork, or pulled chicken. Sides: baked beans, potato salad, pasta salad, or cole slaw',
  'per person', 10, 16.00, 1);
SELECT upsert_menu_item('Dutch Picnic', 'Dutch Picnic, two meats and two sides',
  'Meats: grilled hamburgers, grilled chicken breasts, brats, hot dogs, pulled pork, or pulled chicken. Sides: baked beans, potato salad, pasta salad, or cole slaw',
  'per person', 10, 20.00, 2);

-- ---------------- Central Buffet ----------------
SELECT upsert_menu_item('Central Buffet', 'Buffet 1',
  'One entrée, one starch, one vegetable, two salads, white or wheat rolls, iced tea or lemonade. Includes china, table service and linens on campus',
  'per person', 10, 24.00, 1);
SELECT upsert_menu_item('Central Buffet', 'Buffet 2',
  'Two entrées, two starches, two vegetables, three salads, white or wheat rolls, iced tea or lemonade. Includes china, table service and linens on campus',
  'per person', 10, 28.00, 2);
SELECT upsert_menu_item('Central Buffet', 'Additional Entrée',
  'Add a further entrée to either buffet', 'per person', 10, 10.00, 3);

-- Buffet choices carry no price of their own; they record what was
-- chosen so the catering sheet and the kitchen agree.
SELECT upsert_menu_item('Buffet entrées', 'Carved Prime Rib', 'Market value, priced separately', 'per person', NULL, 0, 1);
SELECT upsert_menu_item('Buffet entrées', 'Beef Tenderloin Medallions', 'Market value, priced separately', 'per person', NULL, 0, 2);
SELECT upsert_menu_item('Buffet entrées', 'Dutch Spiced Beef', NULL, 'per person', NULL, 0, 3);
SELECT upsert_menu_item('Buffet entrées', 'Glazed Chicken Breast', NULL, 'per person', NULL, 0, 4);
SELECT upsert_menu_item('Buffet entrées', 'Hickory Smoked Country Ham', NULL, 'per person', NULL, 0, 5);
SELECT upsert_menu_item('Buffet entrées', 'Oven Roasted Turkey Breast', NULL, 'per person', NULL, 0, 6);
SELECT upsert_menu_item('Buffet entrées', 'Roasted Pork Loin', NULL, 'per person', NULL, 0, 7);
SELECT upsert_menu_item('Buffet entrées', 'Slow Cooked Roast Beef', NULL, 'per person', NULL, 0, 8);
SELECT upsert_menu_item('Buffet entrées', 'Chicken in Mushroom and Wine Sauce', NULL, 'per person', NULL, 0, 9);
SELECT upsert_menu_item('Buffet entrées', 'Dutch Stuffed Chicken', 'Limited availability', 'per person', NULL, 0, 10);
SELECT upsert_menu_item('Buffet entrées', 'Parmesan Crusted Baked Chicken', NULL, 'per person', NULL, 0, 11);
SELECT upsert_menu_item('Buffet entrées', 'Lasagna', NULL, 'per person', NULL, 0, 12);
SELECT upsert_menu_item('Buffet entrées', 'Beef and Noodles', NULL, 'per person', NULL, 0, 13);
SELECT upsert_menu_item('Buffet entrées', 'Chicken and Rice', NULL, 'per person', NULL, 0, 14);
SELECT upsert_menu_item('Buffet entrées', 'Chicken and Noodles', NULL, 'per person', NULL, 0, 15);

SELECT upsert_menu_item('Buffet starches', 'Baked Potatoes', NULL, 'per person', NULL, 0, 1);
SELECT upsert_menu_item('Buffet starches', 'Cheddar Parmesan Potatoes', NULL, 'per person', NULL, 0, 2);
SELECT upsert_menu_item('Buffet starches', 'Mashed Yukon Gold Potatoes', NULL, 'per person', NULL, 0, 3);
SELECT upsert_menu_item('Buffet starches', 'Red Skin Mashed Potatoes', NULL, 'per person', NULL, 0, 4);
SELECT upsert_menu_item('Buffet starches', 'Party Potatoes', NULL, 'per person', NULL, 0, 5);
SELECT upsert_menu_item('Buffet starches', 'Roasted Red Potatoes', NULL, 'per person', NULL, 0, 6);
SELECT upsert_menu_item('Buffet starches', 'Orzo with Shiitake Mushrooms', NULL, 'per person', NULL, 0, 7);
SELECT upsert_menu_item('Buffet starches', 'Wild Rice', NULL, 'per person', NULL, 0, 8);
SELECT upsert_menu_item('Buffet starches', 'Pasta Primavera', NULL, 'per person', NULL, 0, 9);

SELECT upsert_menu_item('Buffet vegetables', 'Asparagus with Parmesan', NULL, 'per person', NULL, 0, 1);
SELECT upsert_menu_item('Buffet vegetables', 'Baked Beans', NULL, 'per person', NULL, 0, 2);
SELECT upsert_menu_item('Buffet vegetables', 'Balsamic Roasted Carrots', NULL, 'per person', NULL, 0, 3);
SELECT upsert_menu_item('Buffet vegetables', 'Broccoli Au Gratin', NULL, 'per person', NULL, 0, 4);
SELECT upsert_menu_item('Buffet vegetables', 'Corn', NULL, 'per person', NULL, 0, 5);
SELECT upsert_menu_item('Buffet vegetables', 'Green Bean Almondine', NULL, 'per person', NULL, 0, 6);
SELECT upsert_menu_item('Buffet vegetables', 'Green Bean Casserole', NULL, 'per person', NULL, 0, 7);
SELECT upsert_menu_item('Buffet vegetables', 'Honey Glazed Carrots', NULL, 'per person', NULL, 0, 8);
SELECT upsert_menu_item('Buffet vegetables', 'Spicy Garlic Broccoli', NULL, 'per person', NULL, 0, 9);

SELECT upsert_menu_item('Buffet salads', 'Basil Tomato', NULL, 'per person', NULL, 0, 1);
SELECT upsert_menu_item('Buffet salads', 'Broccoli Crunch', NULL, 'per person', NULL, 0, 2);
SELECT upsert_menu_item('Buffet salads', 'Caprese Salad', NULL, 'per person', NULL, 0, 3);
SELECT upsert_menu_item('Buffet salads', 'Garden Rotini', NULL, 'per person', NULL, 0, 4);
SELECT upsert_menu_item('Buffet salads', 'Cole Slaw', NULL, 'per person', NULL, 0, 5);
SELECT upsert_menu_item('Buffet salads', 'Mixed Greens Salad', NULL, 'per person', NULL, 0, 6);
SELECT upsert_menu_item('Buffet salads', 'Potato Salad', NULL, 'per person', NULL, 0, 7);
SELECT upsert_menu_item('Buffet salads', 'Romaine with Strawberries', NULL, 'per person', NULL, 0, 8);
SELECT upsert_menu_item('Buffet salads', 'Seven-Layer Salad', NULL, 'per person', NULL, 0, 9);
SELECT upsert_menu_item('Buffet salads', 'Dutch Lettuce', NULL, 'per person', NULL, 0, 10);
SELECT upsert_menu_item('Buffet salads', 'Caesar Salad', NULL, 'per person', NULL, 0, 11);

-- ---------------- Starters ----------------
SELECT upsert_menu_item('Starters', 'Fruit Tray with Dip, small', 'Serves 15 to 20', 'per tray', NULL, 55.00, 1);
SELECT upsert_menu_item('Starters', 'Fruit Tray with Dip, medium', 'Serves 25 to 30', 'per tray', NULL, 90.00, 2);
SELECT upsert_menu_item('Starters', 'Fruit Tray with Dip, large', 'Serves 35 to 40', 'per tray', NULL, 120.00, 3);
SELECT upsert_menu_item('Starters', 'Chilled Vegetable Tray with Dip, small', 'Serves 15 to 20', 'per tray', NULL, 40.00, 4);
SELECT upsert_menu_item('Starters', 'Chilled Vegetable Tray with Dip, medium', 'Serves 25 to 30', 'per tray', NULL, 65.00, 5);
SELECT upsert_menu_item('Starters', 'Chilled Vegetable Tray with Dip, large', 'Serves 35 to 40', 'per tray', NULL, 90.00, 6);
SELECT upsert_menu_item('Starters', 'Custom Charcuterie, small', 'Serves 15 to 20. Price may vary with the items selected', 'per tray', NULL, 100.00, 7);
SELECT upsert_menu_item('Starters', 'Custom Charcuterie, medium', 'Serves 25 to 30. Price may vary with the items selected', 'per tray', NULL, 160.00, 8);
SELECT upsert_menu_item('Starters', 'Custom Charcuterie, large', 'Serves 35 to 40. Price may vary with the items selected', 'per tray', NULL, 220.00, 9);
SELECT upsert_menu_item('Starters', 'Stuffed Cherry Tomatoes BLT', 'Serves 12', 'per tray', NULL, 36.00, 10);
SELECT upsert_menu_item('Starters', 'Tomato Basil Bruschetta Dip', 'With baguettes. Serves 12', 'per tray', NULL, 36.00, 11);
SELECT upsert_menu_item('Starters', 'Crackers and Spreads',
  'Garden cheese spread, ham spread and bar cheese. Serves 12', 'per tray', NULL, 30.00, 12);
SELECT upsert_menu_item('Starters', 'Nibbler Tray and Crackers',
  'Domestic cheeses, Pella bologna, salami and summer sausage. Serves 12', 'per tray', NULL, 60.00, 13);
SELECT upsert_menu_item('Starters', 'Dutch Treats',
  'Pella dried beef, gouda and sweet gherkin pickles. Serves 12', 'per tray', NULL, 48.00, 14);
SELECT upsert_menu_item('Starters', 'Shrimp Cocktail', 'Two shrimp each. Serves 12', 'per tray', NULL, 28.00, 15, 'Shellfish');
SELECT upsert_menu_item('Starters', 'Spinach Artichoke Dip', 'With baguettes. Serves 12', 'per tray', NULL, 30.00, 16);
SELECT upsert_menu_item('Starters', 'Cocktail Mushrooms', 'Serves 12', 'per tray', NULL, 30.00, 17);
SELECT upsert_menu_item('Starters', 'Meatballs',
  'Choose one: BBQ, marinara, or sweet and sour. Serves 12. An additional flavour is $2 per person',
  'per tray', NULL, 36.00, 18);
SELECT upsert_menu_item('Starters', 'Bacon Wrapped Water Chestnuts', 'Serves 12', 'per tray', NULL, 42.00, 19);
SELECT upsert_menu_item('Starters', 'Chicken Satay', 'Serves 12', 'per tray', NULL, 45.00, 20);
SELECT upsert_menu_item('Starters', 'Chef Hang''s Homemade Egg Rolls',
  'With plum sauce, one piece each. Serves 12. Limited availability', 'per tray', NULL, 50.00, 21);
SELECT upsert_menu_item('Starters', 'Chef Hang''s Homemade Crab Rangoon',
  'One piece each. Serves 12. Limited availability', 'per tray', NULL, 45.00, 22, 'Shellfish');
SELECT upsert_menu_item('Starters', 'Naked Wings',
  'Dipping sauces: buffalo, sweet chili or ranch. Serves 12', 'per tray', NULL, 40.00, 23);
SELECT upsert_menu_item('Starters', 'Petite Beef Kabobs', 'Serves 12', 'per tray', NULL, 50.00, 24);
SELECT upsert_menu_item('Starters', 'Beef Tenderloin Tips', 'With signature sauce. Serves 12', 'per tray', NULL, 60.00, 25);

-- ---------------- Desserts ----------------
SELECT upsert_menu_item('Desserts', 'Cookies',
  'Chocolate chip, snickerdoodle, sugar, double chocolate chip, or s''mores', 'each', NULL, 1.50, 1);
SELECT upsert_menu_item('Desserts', 'Cookies by the dozen',
  'Chocolate chip, snickerdoodle, sugar, double chocolate chip, or s''mores', 'per dozen', NULL, 18.00, 2);
SELECT upsert_menu_item('Desserts', 'Homemade Bars',
  'Caramel, almond, brownies, lemon, or scotcharoos', 'each', NULL, 2.50, 3);
SELECT upsert_menu_item('Desserts', 'Homemade Bars by the dozen',
  'Caramel, almond, brownies, lemon, or scotcharoos', 'per dozen', NULL, 30.00, 4);
SELECT upsert_menu_item('Desserts', 'Mousse in Chocolate Cups',
  'Raspberry, chocolate, or white chocolate. Bite size, two each', 'per person', 10, 3.00, 5);
SELECT upsert_menu_item('Desserts', 'Triple Berry Crisp in Ramekins', NULL, 'per person', 10, 4.00, 6);
SELECT upsert_menu_item('Desserts', 'Flourless Chocolate Cake', 'With raspberry sauce', 'per person', 10, 4.75, 7);
SELECT upsert_menu_item('Desserts', 'Homemade Dutch Apple Cake', 'With pecan caramel sauce', 'per person', 10, 4.00, 8);
SELECT upsert_menu_item('Desserts', 'Strawberry Shortcake',
  'Pound cake with strawberry topping and whipped cream', 'per person', 10, 4.00, 9);
SELECT upsert_menu_item('Desserts', 'Sundae Bar',
  'Ice cream cup, vanilla or chocolate, with three toppings and three sauces. Ice cream tub available at additional cost',
  'per person', 10, 5.25, 10);
SELECT upsert_menu_item('Desserts', 'Buster Barz',
  'Vanilla ice cream layered with fudge, caramel and peanuts. Serves 28', 'each', NULL, 60.00, 11, 'Peanuts');
SELECT upsert_menu_item('Desserts', 'Half Sheet Cake',
  'White, chocolate or marble with Central''s gourmet frosting. Serves 35. Decorated cakes cost extra',
  'each', NULL, 55.00, 12);
SELECT upsert_menu_item('Desserts', 'Whole Sheet Cake',
  'White, chocolate or marble with Central''s gourmet frosting. Serves 70. Decorated cakes cost extra',
  'each', NULL, 75.00, 13);
SELECT upsert_menu_item('Desserts', 'Double Layer Cake',
  'Nine inch round, double chocolate, carrot or red velvet. Serves 15', 'each', NULL, 45.00, 14);
SELECT upsert_menu_item('Desserts', 'Snack Mix or Trail Mix',
  'Gardettos or Chex Mix, or nuts and fruits', 'per person', 10, 2.50, 15);
SELECT upsert_menu_item('Desserts', 'Popcorn Bar',
  'M&M''s, mini pretzels, assorted candies, and seasonings', 'per person', 10, 3.00, 16);

-- ---------------- Drinks ----------------
SELECT upsert_menu_item('Drinks', 'Coffee', 'Regular or decaf', 'per gallon', NULL, 18.00, 1);
SELECT upsert_menu_item('Drinks', 'Iced Coffee', NULL, 'per gallon', NULL, 30.00, 2);
SELECT upsert_menu_item('Drinks', 'Hot Chocolate', NULL, 'per gallon', NULL, 20.00, 3);
SELECT upsert_menu_item('Drinks', 'Hot Tea', 'Various flavours available', 'per person', 10, 1.50, 4);
SELECT upsert_menu_item('Drinks', 'Iced Tea', NULL, 'per gallon', NULL, 15.00, 5);
SELECT upsert_menu_item('Drinks', 'Lemonade', NULL, 'per gallon', NULL, 15.00, 6);
SELECT upsert_menu_item('Drinks', 'Sparkling Punch', NULL, 'per gallon', NULL, 20.00, 7);
SELECT upsert_menu_item('Drinks', 'Hot Apple Cider', NULL, 'per gallon', NULL, 20.00, 8);
SELECT upsert_menu_item('Drinks', 'Soda, Water or Iced Tea', 'Can or bottle', 'each', NULL, 3.00, 9);

-- ---------------- Bar service ----------------
SELECT upsert_menu_item('Bar service', 'Bar Set Up, on campus',
  'Domestic beers, seltzers and house or premium wine', 'per event', NULL, 100.00, 1);
SELECT upsert_menu_item('Bar service', 'Bar Set Up, off campus',
  'Available with catering. Domestic beers, seltzers and house or premium wine', 'per event', NULL, 225.00, 2);
SELECT upsert_menu_item('Bar service', 'Bartender', NULL, 'per hour', NULL, 25.00, 3);
SELECT upsert_menu_item('Bar service', 'Craft Beer Upgrade, on campus', NULL, 'per event', NULL, 25.00, 4);
SELECT upsert_menu_item('Bar service', 'Craft Beer Upgrade, off campus', NULL, 'per event', NULL, 40.00, 5);

-- ---------------- Carry out ----------------
SELECT upsert_menu_item('Carry out', 'Potato Salad, Pasta Salad or Coleslaw', 'Pick up only', 'per pound', NULL, 9.00, 1);
SELECT upsert_menu_item('Carry out', 'Baked Beans or Green Bean Casserole', 'Pick up only', 'per pound', NULL, 7.00, 2);
SELECT upsert_menu_item('Carry out', 'Broccoli Crunch', 'Pick up only', 'per pound', NULL, 10.00, 3);
SELECT upsert_menu_item('Carry out', 'Pulled Pork or Spiced Beef', 'Pick up only', 'per pound', NULL, 15.00, 4);
SELECT upsert_menu_item('Carry out', 'Lasagna, large pan', '24 servings. Pick up only', 'per pan', NULL, 75.00, 5);
SELECT upsert_menu_item('Carry out', 'Gluten Free Lasagna, large pan', '24 servings. Pick up only', 'per pan', NULL, 85.00, 6, 'Gluten free');
SELECT upsert_menu_item('Carry out', 'Hot Chicken Salad', '24 servings. Pick up only', 'per pan', NULL, 75.00, 7);
SELECT upsert_menu_item('Carry out', 'Breakfast Egg Casserole', '24 servings. Pick up only', 'per pan', NULL, 75.00, 8);
SELECT upsert_menu_item('Carry out', 'Gluten Free Breakfast Casserole', '24 servings. Pick up only', 'per pan', NULL, 90.00, 9, 'Gluten free');
SELECT upsert_menu_item('Carry out', 'Bars, full pan', '70 servings. Pick up only', 'per pan', NULL, 140.00, 10);

-- ------------------------------------------------------------
-- Project the other three tiers from the external rate.
-- ------------------------------------------------------------

SELECT reapply_pricing_tiers();

DO $$
DECLARE
  active_items integer;
  retired integer;
  priced integer;
BEGIN
  SELECT count(*) INTO active_items FROM menu_items WHERE is_active;
  SELECT count(*) INTO retired FROM menu_items WHERE NOT is_active;
  SELECT count(DISTINCT menu_item_id) INTO priced
    FROM menu_item_prices
   WHERE path = 'external_commercial' AND effective_to IS NULL;

  RAISE NOTICE 'Fall 2026 menu: % items live, % retired, % priced',
    active_items, retired, priced;

  IF active_items <> priced THEN
    RAISE WARNING 'Some live items have no current external price';
  END IF;
END $$;
