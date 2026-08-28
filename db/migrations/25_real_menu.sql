-- ============================================================
-- Migration 25 - Central College Catering menu
--
-- Replaces the placeholder menu with the real one from the
-- July 2026 menu document.
--
-- PRICING NOTE. The menu publishes one price per item. All four
-- tiers are loaded with that price, so nothing quotes wrongly
-- today. If internal or affiliated events are charged less than
-- the published rate, adjust them in Back office - Catering menu.
-- The tiers exist and work; they are simply all equal for now.
--
-- Placeholder items are deactivated rather than deleted so any
-- test event that ordered one keeps its record.
-- ============================================================

UPDATE menu_items SET is_active = false;
UPDATE menu_categories SET is_active = false;

INSERT INTO menu_categories (name, description, sort_order, is_active) VALUES
  ('Breakfast',            'Morning service. All prices per person unless noted.', 1, true),
  ('Breakfast à la carte', 'Individual breakfast items.', 2, true),
  ('Lunch',                'Midday service. All prices per person unless noted.', 3, true),
  ('Boxed lunches',        'Sandwiches, wraps and salads, each served with chips, choice of pasta or potato salad, and a cookie.', 4, true),
  ('Soups',                'By the gallon. Sixteen 8oz servings per gallon.', 5, true),
  ('Lunch à la carte',     'Sides and extras.', 6, true),
  ('Peace Street Pizza',   'Available for parties under 60.', 7, true),
  ('Dutch Picnic',         'Grilled service with buns and condiments.', 8, true),
  ('Starters',             'All prices per person unless noted.', 9, true),
  ('Central Buffet',       'Includes china, table service and linens on campus. Entrée upgrades add $10 per person.', 10, true),
  ('Desserts',             'Sweets and celebration cakes.', 11, true),
  ('Drinks',               'Coffee, tea and non-alcoholic service.', 12, true),
  ('Bar service',          'Available with catering. Bartenders $25 per hour.', 13, true),
  ('Carry out',            'Pick up only.', 14, true)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

CREATE TEMP TABLE m (
  category text, name text, description text,
  unit text, minimum integer, allergens text, price numeric(10,2), ord integer
);

INSERT INTO m VALUES
-- Breakfast
('Breakfast','The Big Red Breakfast','Scrambled eggs, grilled hash browns, bacon or sausage, fresh cut fruit, one bakery item, and coffee.','per person',NULL,'Contains egg, wheat, dairy',13.00,1),
('Breakfast','Continental Breakfast','Assorted muffins, mini cinnamon rolls, apple turnovers, cut fruit and coffee.','per person',NULL,'Contains wheat, dairy',10.00,2),
('Breakfast','Healthy Choice','Fresh cut fruit, yogurt, granola, berries, slivered almonds, and coffee.','per person',NULL,'Contains dairy, tree nuts',8.00,3),
('Breakfast','Breakfast Croissant Sandwich','Bacon, sausage or ham with egg and cheese.','per person',NULL,'Contains wheat, egg, dairy',8.00,4),
('Breakfast','Breakfast Burrito','Scrambled eggs, ham or sausage, mushrooms, peppers, onions and cheese rolled in a tortilla.','per person',NULL,'Contains wheat, egg, dairy',8.00,5),
('Breakfast','Breakfast Pizza','Choice of sausage, bacon, ham or veggie.','each (14 squares)',NULL,'Contains wheat, egg, dairy',18.00,6),
('Breakfast','Gluten Free Breakfast Pizza','Gluten free crust.','each (serves 8)',NULL,'Contains egg, dairy',15.00,7),
('Breakfast','Breakfast Casserole, half pan','Bacon and egg, sausage and egg, Denver, or veggie.','half pan (serves 12)',NULL,'Contains egg, dairy',40.00,8),
('Breakfast','Breakfast Casserole, full pan','Bacon and egg, sausage and egg, Denver, or veggie.','full pan (serves 24)',NULL,'Contains egg, dairy',75.00,9),
('Breakfast','Quiche','Quiche Lorraine (ham and swiss) or three cheese and spinach.','each (serves 6)',NULL,'Contains wheat, egg, dairy',25.00,10),
('Breakfast','Coffee Cake','Cinnamon and sugar, or berry.','each (serves 18)',NULL,'Contains wheat, egg, dairy',27.00,11),

-- Breakfast à la carte
('Breakfast à la carte','Hashbrowns',NULL,'per person',NULL,NULL,1.75,1),
('Breakfast à la carte','Bacon','Three pieces.','per person',NULL,NULL,3.00,2),
('Breakfast à la carte','Sausage','Two pieces.','per person',NULL,NULL,3.00,3),
('Breakfast à la carte','Pancake','One.','per person',NULL,'Contains wheat, egg, dairy',2.00,4),
('Breakfast à la carte','Biscuit and Gravy','One.','per person',NULL,'Contains wheat, dairy',3.50,5),
('Breakfast à la carte','Muffin',NULL,'each',NULL,'Contains wheat, egg, dairy',2.00,6),
('Breakfast à la carte','Cinnamon Roll',NULL,'each',NULL,'Contains wheat, egg, dairy',2.00,7),
('Breakfast à la carte','Turnover',NULL,'each',NULL,'Contains wheat, dairy',2.00,8),
('Breakfast à la carte','Mixed Cut Fruit',NULL,'per person',NULL,NULL,2.50,9),
('Breakfast à la carte','Whole Fruit',NULL,'each',NULL,NULL,1.50,10),
('Breakfast à la carte','Yogurt Cup',NULL,'each',NULL,'Contains dairy',2.00,11),
('Breakfast à la carte','Bakery Donut Holes','Three.','per person',NULL,'Contains wheat, egg, dairy',1.50,12),
('Breakfast à la carte','Bakery Dutch Letter',NULL,'each',NULL,'Contains wheat, egg, dairy, tree nuts',2.50,13),

-- Lunch
('Lunch','Lasagna, full pan','Homemade lasagna with tossed salad, dressings, and garlic bread.','full pan (serves 24)',NULL,'Contains wheat, dairy',120.00,1),
('Lunch','Lasagna, half pan','Homemade lasagna with tossed salad, dressings, and garlic bread.','half pan (serves 12)',NULL,'Contains wheat, dairy',60.00,2),
('Lunch','Comfort Meal','Dutch spiced beef or oven roasted turkey breast with mashed potatoes, gravy, corn, white or wheat roll and a cookie.','per person',NULL,'Contains wheat, dairy',16.00,3),
('Lunch','Asian Lunch','Choose two: sweet and sour chicken, General Tso chicken, orange chicken, Mongolian beef or beef and broccoli. Served with jasmine rice and an egg roll.','per person',NULL,'Contains wheat, soy',18.00,4),
('Lunch','Mexican Fiesta Bar','Seasoned beef with two flour tortillas per person and tortilla chips, or chicken enchiladas with lettuce, cheese, tomatoes, salsa and sour cream. Served with Mexican rice and refried beans.','per person',NULL,'Contains wheat, dairy',18.00,5),
('Lunch','Chicken Burrito Bowl','Shredded seasoned chicken with jasmine rice, diced tomatoes, black beans, southwest corn, shredded cheese, salsa and sour cream. Add guacamole for $1 per person.','per person',NULL,'Contains dairy',16.00,6),
('Lunch','Pasta Bar','Penne pasta with a choice of two sauces: marinara, alfredo or meat sauce. Served with side salad and garlic bread. Add chicken or meatballs for $2 per person.','per person',NULL,'Contains wheat, dairy',16.00,7),
('Lunch','Potato Bar','Baked potato with taco meat, ham, broccoli and cheese sauce, sour cream, salsa, bacon bits and butter.','per person',NULL,'Contains dairy',16.00,8),
('Lunch','Deli Buffet','Tray of turkey, ham, roast beef, swiss and colby jack cheeses, lettuce and tomato, with assorted breads, pasta or potato salad, and chips.','per person',NULL,'Contains wheat, dairy',18.00,9),
('Lunch','Salad Bar','Choice of romaine or mixed greens with ham, turkey, hard boiled egg, tomatoes, cucumbers, red onion, broccoli, assorted cheeses, bacon bits, croutons and dressings.','per person',NULL,'Contains egg, dairy, wheat',15.00,10),
('Lunch','Three-Foot Sub','Choose two meats: turkey, ham, roast beef, Pella bologna or salami. With lettuce, tomato, pickles, onions, American and swiss cheese.','each (serves 15)',NULL,'Contains wheat, dairy',40.00,11),

-- Boxed lunches
('Boxed lunches','Boxed Gourmet Salad','Chef, Harvest, Grilled Chicken Caesar, Strawberry Chicken Romaine, Taco, or Greek Chicken.','per person',NULL,'Varies by selection',14.00,1),
('Boxed lunches','BBQ Pulled Pork on Bakery Bun',NULL,'per person',NULL,'Contains wheat',14.00,2),
('Boxed lunches','Grilled Chicken on Sourdough',NULL,'per person',NULL,'Contains wheat',14.00,3),
('Boxed lunches','Dutch Spiced Beef on Bakery Bun',NULL,'per person',NULL,'Contains wheat',15.00,4),
('Boxed lunches','Roast Beef or Turkey on a Hoagie Bun',NULL,'per person',NULL,'Contains wheat',11.00,5),
('Boxed lunches','Ham and Cheese on a Croissant',NULL,'per person',NULL,'Contains wheat, dairy',11.00,6),
('Boxed lunches','Italian Sub','Ham, salami and pepperoni on a hoagie.','per person',NULL,'Contains wheat',14.00,7),
('Boxed lunches','Gourmet BLT Wrap',NULL,'per person',NULL,'Contains wheat',13.00,8),
('Boxed lunches','Club Wrap',NULL,'per person',NULL,'Contains wheat',14.00,9),
('Boxed lunches','Caesar Wrap',NULL,'per person',NULL,'Contains wheat, dairy, egg, fish',13.00,10),
('Boxed lunches','Buffalo Chicken Wrap',NULL,'per person',NULL,'Contains wheat, dairy',13.00,11),
('Boxed lunches','Spicy Honey Chicken Wrap',NULL,'per person',NULL,'Contains wheat',14.00,12),
('Boxed lunches','Greek Chicken Wrap',NULL,'per person',NULL,'Contains wheat, dairy',14.00,13),

-- Soups
('Soups','Cheeseburger Chowder',NULL,'per gallon',NULL,'Contains dairy, wheat',30.00,1),
('Soups','Cream of Broccoli',NULL,'per gallon',NULL,'Contains dairy',30.00,2),
('Soups','Chicken and Rice',NULL,'per gallon',NULL,NULL,30.00,3),
('Soups','Cream of Potato',NULL,'per gallon',NULL,'Contains dairy',30.00,4),
('Soups','Chicken Noodle',NULL,'per gallon',NULL,'Contains wheat, egg',30.00,5),
('Soups','Vegetable',NULL,'per gallon',NULL,NULL,30.00,6),
('Soups','Chili','Seasonal.','per gallon',NULL,NULL,30.00,7),

-- Lunch à la carte
('Lunch à la carte','Pasta Salad',NULL,'per person',NULL,'Contains wheat',2.00,1),
('Lunch à la carte','Potato Salad',NULL,'per person',NULL,'Contains egg',2.00,2),
('Lunch à la carte','Cole Slaw',NULL,'per person',NULL,'Contains egg',2.00,3),
('Lunch à la carte','Baked Beans',NULL,'per person',NULL,NULL,2.00,4),
('Lunch à la carte','Party Potatoes',NULL,'per person',NULL,'Contains dairy',2.50,5),
('Lunch à la carte','Side Salad',NULL,'per person',NULL,NULL,3.50,6),
('Lunch à la carte','Individual Bags of Assorted Chips',NULL,'per person',NULL,NULL,2.00,7),
('Lunch à la carte','Tossed Salad with Two Dressings','Added to a pizza order.','per person',NULL,NULL,4.00,8),

-- Pizza
('Peace Street Pizza','Cheese Pizza','Blend of mozzarella, cheddar and parmesan.','large 16 inch (12 slices)',NULL,'Contains wheat, dairy',18.00,1),
('Peace Street Pizza','Pepperoni Pizza',NULL,'large 16 inch (12 slices)',NULL,'Contains wheat, dairy',19.00,2),
('Peace Street Pizza','Vegetable Pizza','Mushrooms, onions, green and red bell peppers and black olives.','large 16 inch (12 slices)',NULL,'Contains wheat, dairy',19.00,3),
('Peace Street Pizza','Big Red Pizza','Pella bologna, pepperoni, sausage, Canadian bacon, onions, mushrooms, green bell peppers and black olives.','large 16 inch (12 slices)',NULL,'Contains wheat, dairy',23.00,4),
('Peace Street Pizza','Meat Lovers Pizza','Pella bologna, pepperoni, sausage and Canadian bacon.','large 16 inch (12 slices)',NULL,'Contains wheat, dairy',22.00,5),
('Peace Street Pizza','Supreme Pizza','Pepperoni, sausage, Canadian bacon, bell peppers, onions and mushrooms.','large 16 inch (12 slices)',NULL,'Contains wheat, dairy',22.00,6),
('Peace Street Pizza','Gluten Free Cheese Pizza',NULL,'each (serves 8)',NULL,'Contains dairy',15.00,7),

-- Dutch Picnic
('Dutch Picnic','Dutch Picnic, one meat and one side','Grilled hamburgers, grilled chicken breasts, brats, hot dogs or pulled pork, with bakery buns and condiments. Sides: baked beans, potato salad, pasta salad or cole slaw.','per person',NULL,'Contains wheat',16.00,1),
('Dutch Picnic','Dutch Picnic, two meats and two sides','Grilled hamburgers, grilled chicken breasts, brats, hot dogs or pulled pork, with bakery buns and condiments. Sides: baked beans, potato salad, pasta salad or cole slaw.','per person',NULL,'Contains wheat',20.00,2),

-- Starters
('Starters','Supreme Fruit Tray with Dip, large',NULL,'each (serves 35-40)',NULL,'Contains dairy',120.00,1),
('Starters','Supreme Fruit Tray with Dip, medium',NULL,'each (serves 25-30)',NULL,'Contains dairy',90.00,2),
('Starters','Supreme Fruit Tray with Dip, small',NULL,'each (serves 15-20)',NULL,'Contains dairy',55.00,3),
('Starters','Chilled Vegetable Tray with Dip, large',NULL,'each (serves 35-40)',NULL,'Contains dairy',90.00,4),
('Starters','Chilled Vegetable Tray with Dip, medium',NULL,'each (serves 25-30)',NULL,'Contains dairy',65.00,5),
('Starters','Chilled Vegetable Tray with Dip, small',NULL,'each (serves 15-20)',NULL,'Contains dairy',40.00,6),
('Starters','Custom Charcuterie, large','Prices may vary based on items selected.','each (serves 35-40)',NULL,'Contains dairy, wheat',220.00,7),
('Starters','Custom Charcuterie, medium','Prices may vary based on items selected.','each (serves 25-30)',NULL,'Contains dairy, wheat',160.00,8),
('Starters','Custom Charcuterie, small','Prices may vary based on items selected.','each (serves 15-20)',NULL,'Contains dairy, wheat',100.00,9),
('Starters','Stuffed Cherry Tomatoes BLT','Two per person.','per person',NULL,'Contains dairy',3.00,10),
('Starters','Tomato Basil Bruschetta','Two per person.','per person',NULL,'Contains wheat',3.00,11),
('Starters','Crackers and Spreads','Garden cheese spread, ham spread and bar cheese.','per person',NULL,'Contains wheat, dairy',2.50,12),
('Starters','Nibbler Tray and Crackers','Domestic cheeses, Pella bologna, salami and summer sausage.','per person',NULL,'Contains wheat, dairy',5.00,13),
('Starters','Dutch Treats','Pella dried beef, gouda and sweet gherkin pickle. Two per person.','per person',NULL,'Contains dairy',4.00,14),
('Starters','Shrimp Cocktail','Two shrimp each.','per person',NULL,'Contains shellfish',3.00,15),
('Starters','Spinach Artichoke Dip with Baguettes',NULL,'per person',NULL,'Contains wheat, dairy',2.50,16),
('Starters','Cocktail Mushrooms','Two pieces.','per person',NULL,NULL,2.50,17),
('Starters','Meatballs','Pick one: BBQ, marinara or sweet and sour. Three pieces. Additional flavour $2 per person.','per person',NULL,'Contains wheat',3.00,18),
('Starters','Bacon Wrapped Water Chestnuts','Two pieces.','per person',NULL,NULL,3.50,19),
('Starters','Chicken Satay','Two pieces.','per person',NULL,'Contains peanuts, soy',4.50,20),
('Starters','Chef Hang''s Homemade Egg Rolls','With plum sauce. One piece. Limited availability.','per person',NULL,'Contains wheat, soy',4.50,21),
('Starters','Chef Hang''s Homemade Crab Rangoon','One piece. Limited availability.','per person',NULL,'Contains wheat, dairy, shellfish',4.50,22),
('Starters','Naked Wings','Three pieces. Dipping sauces: buffalo, sweet chili or ranch.','per person',NULL,'Contains dairy',4.00,23),
('Starters','Petite Beef Kabobs','Two pieces.','per person',NULL,NULL,5.00,24),
('Starters','Beef Tenderloin Tips','With signature sauce. Two pieces.','per person',NULL,NULL,6.00,25),

-- Central Buffet
('Central Buffet','Buffet 1','One entrée, one starch, one vegetable, two salads, white or wheat rolls, iced tea or lemonade. Includes china, table service and linens on campus.','per person',NULL,'Varies by selection',24.00,1),
('Central Buffet','Buffet 2','Two entrées, two starches, two vegetables, three salads, white or wheat rolls, iced tea or lemonade. Includes china, table service and linens on campus.','per person',NULL,'Varies by selection',28.00,2),
('Central Buffet','Premium entrée upgrade','Carved prime rib, beef tenderloin medallions or Dutch chicken. Market value applies to carved prime rib and tenderloin.','per person',NULL,'Varies by selection',10.00,3),

-- Desserts
('Desserts','Cookies','Chocolate chip, snickerdoodle, sugar, double chocolate chip, or s''mores.','each',NULL,'Contains wheat, egg, dairy',1.50,1),
('Desserts','Cookies by the dozen','Chocolate chip, snickerdoodle, sugar, double chocolate chip, or s''mores.','per dozen',NULL,'Contains wheat, egg, dairy',18.00,2),
('Desserts','Homemade Bars','Caramel, almond, brownies, lemon, or scotcharoos.','each',NULL,'Contains wheat, egg, dairy, tree nuts, peanuts',2.50,3),
('Desserts','Homemade Bars by the dozen','Caramel, almond, brownies, lemon, or scotcharoos.','per dozen',NULL,'Contains wheat, egg, dairy, tree nuts, peanuts',30.00,4),
('Desserts','Mousse in Chocolate Cups','Raspberry, chocolate or white chocolate. Bite size, two each.','per person',NULL,'Contains dairy, egg',3.00,5),
('Desserts','Triple Berry Crisp in Ramekins',NULL,'per person',NULL,'Contains wheat, dairy',4.00,6),
('Desserts','Flourless Chocolate Cake','With raspberry sauce.','per person',NULL,'Contains egg, dairy',4.75,7),
('Desserts','Homemade Dutch Apple Cake','With pecan caramel sauce.','per person',NULL,'Contains wheat, egg, dairy, tree nuts',4.00,8),
('Desserts','Sundae Bar','Ice cream cup, vanilla or chocolate, with three toppings and three sauces. Ice cream tub available at additional fee.','per person',NULL,'Contains dairy',5.25,9),
('Desserts','Buster Barz','Vanilla ice cream layered with fudge, caramel and peanuts.','each (serves 28)',NULL,'Contains dairy, peanuts',60.00,10),
('Desserts','Sheet Cake, half','White, chocolate or marble with Central''s gourmet frosting. Additional fees apply for decorated cakes.','half sheet (serves 35)',NULL,'Contains wheat, egg, dairy',55.00,11),
('Desserts','Sheet Cake, whole','White, chocolate or marble with Central''s gourmet frosting. Additional fees apply for decorated cakes.','whole sheet (serves 70)',NULL,'Contains wheat, egg, dairy',75.00,12),
('Desserts','Snack or Trail Mix',NULL,'per person',NULL,'Contains tree nuts, peanuts',2.50,13),
('Desserts','Popcorn Bar','M&Ms, mini pretzels, assorted candies and seasonings.','per person',NULL,'Contains wheat, dairy, peanuts',3.00,14),
('Desserts','Dessert cutting and plating','Fee to cut and plate dessert brought in from outside. Includes dessert plates and utensils.','per person',NULL,NULL,1.00,15),

-- Drinks
('Drinks','Coffee, regular or decaf',NULL,'per gallon',NULL,NULL,18.00,1),
('Drinks','Iced Coffee',NULL,'each',NULL,'Contains dairy',4.25,2),
('Drinks','Hot Chocolate',NULL,'per gallon',NULL,'Contains dairy',20.00,3),
('Drinks','Hot Tea','Various flavours available.','per person',NULL,NULL,1.50,4),
('Drinks','Iced Tea',NULL,'per gallon',NULL,NULL,15.00,5),
('Drinks','Lemonade',NULL,'per gallon',NULL,NULL,15.00,6),
('Drinks','Sparkling Punch',NULL,'per gallon',NULL,NULL,20.00,7),
('Drinks','Hot Apple Cider',NULL,'per gallon',NULL,NULL,20.00,8),
('Drinks','Bottled Soda, Water or Iced Tea',NULL,'each',NULL,NULL,3.00,9),

-- Bar service
('Bar service','Bar set-up, on campus','Outside the Graham Center. Includes domestic beers, seltzers and house or premium wine.','per event',NULL,NULL,100.00,1),
('Bar service','Bar set-up, off campus','Available with catering. Includes domestic beers, seltzers and house or premium wine.','per event',NULL,NULL,225.00,2),
('Bar service','Bartender','Per bartender.','per hour',NULL,NULL,25.00,3),
('Bar service','Craft beer upgrade, on campus',NULL,'per event',NULL,NULL,25.00,4),
('Bar service','Craft beer upgrade, off campus',NULL,'per event',NULL,NULL,40.00,5),

-- Carry out
('Carry out','Potato Salad, Pasta Salad or Coleslaw',NULL,'per pound',NULL,'Contains egg, wheat',9.00,1),
('Carry out','Baked Beans or Green Bean Casserole',NULL,'per pound',NULL,'Contains dairy',7.00,2),
('Carry out','Broccoli Crunch',NULL,'per pound',NULL,'Contains dairy',10.00,3),
('Carry out','Pulled Pork or Spiced Beef',NULL,'per pound',NULL,NULL,15.00,4),
('Carry out','Lasagna, full pan',NULL,'full pan (24 servings)',NULL,'Contains wheat, dairy',75.00,5),
('Carry out','Gluten Free Lasagna',NULL,'full pan (24 servings)',NULL,'Contains dairy',85.00,6),
('Carry out','Hot Chicken Salad',NULL,'each (24 servings)',NULL,'Contains dairy',75.00,7),
('Carry out','Breakfast Egg Casserole',NULL,'each (24 servings)',NULL,'Contains egg, dairy',75.00,8),
('Carry out','Breakfast Gluten Free Casserole',NULL,'each (24 servings)',NULL,'Contains egg, dairy',90.00,9),
('Carry out','Bars, full pan',NULL,'full pan (70 servings)',NULL,'Contains wheat, egg, dairy',140.00,10);

INSERT INTO menu_items
  (category_id, name, description, unit, minimum_quantity, allergen_notes, sort_order, is_active)
SELECT c.id, m.name, m.description, m.unit, m.minimum, m.allergens, m.ord, true
  FROM m JOIN menu_categories c ON c.name = m.category
ON CONFLICT (category_id, name) DO UPDATE
  SET description = EXCLUDED.description,
      unit = EXCLUDED.unit,
      allergen_notes = EXCLUDED.allergen_notes,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- Close any price currently in effect for these items, then open the
-- published price on every tier from today.
UPDATE menu_item_prices p
   SET effective_to = CURRENT_DATE
  FROM m JOIN menu_categories c ON c.name = m.category
  JOIN menu_items mi ON mi.name = m.name AND mi.category_id = c.id
 WHERE p.menu_item_id = mi.id
   AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE);

INSERT INTO menu_item_prices (menu_item_id, path, unit_price, effective_from)
SELECT mi.id, t.path::financial_path, m.price, CURRENT_DATE
  FROM m
  JOIN menu_categories c ON c.name = m.category
  JOIN menu_items mi ON mi.name = m.name AND mi.category_id = c.id
  CROSS JOIN (VALUES
    ('internal_non_revenue'),
    ('internal_revenue_generating'),
    ('affiliated_cost_recovery'),
    ('external_commercial')
  ) AS t(path);

DROP TABLE m;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM menu_items WHERE is_active;
  IF n < 100 THEN
    RAISE EXCEPTION 'Menu load produced only % active items', n;
  END IF;
  RAISE NOTICE 'Menu loaded: % active items', n;
END $$;
