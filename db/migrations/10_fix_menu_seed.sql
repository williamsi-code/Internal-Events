-- ============================================================
-- Migration 10 - Fix the menu seed
--
-- Migration 09 used ON CONFLICT (name) on menu_categories, but that
-- column had no unique constraint, so the insert matched nothing and
-- quietly did nothing. Every downstream join then had an empty table
-- to work with. The migration reported success while inserting zero
-- rows - a reminder that a green migration is not the same as a
-- migration that did something.
--
-- This adds the constraint and re-runs the seed.
-- ============================================================

ALTER TABLE menu_categories
  ADD CONSTRAINT menu_categories_name_key UNIQUE (name);

ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_name_category_key UNIQUE (category_id, name);

INSERT INTO menu_categories (name, description, sort_order) VALUES
  ('Breakfast',  'Morning service, available before 10:30 AM.', 1),
  ('Breaks',     'Refreshments and light snacks between sessions.', 2),
  ('Lunch',      'Midday service, buffet or plated.', 3),
  ('Dinner',     'Evening service, buffet or plated.', 4),
  ('Receptions', 'Passed and stationed hors d''oeuvres.', 5),
  ('Beverages',  'Coffee, tea, and non-alcoholic service.', 6),
  ('Desserts',   'Sweets and celebration cakes.', 7)
ON CONFLICT (name) DO NOTHING;

CREATE TEMP TABLE seed_items (
  category    text,
  name        text,
  description text,
  unit        text,
  minimum     integer,
  allergens   text,
  base_cost   numeric(10,2),
  ord         integer
);

INSERT INTO seed_items VALUES
  ('Breakfast','Continental breakfast','Pastries, seasonal fruit, yogurt, juice.','per person',10,'Contains wheat, dairy',6.25,1),
  ('Breakfast','Hot breakfast buffet','Scrambled eggs, breakfast meat, potatoes, fruit.','per person',20,'Contains egg, dairy',9.50,2),
  ('Breakfast','Breakfast sandwiches','Egg and cheese on a biscuit or croissant.','per person',10,'Contains wheat, egg, dairy',5.75,3),
  ('Breakfast','Yogurt parfait bar','Greek yogurt, granola, berries, honey.','per person',15,'Contains dairy, tree nuts',5.00,4),

  ('Breaks','Coffee and cookies','Regular and decaf coffee with assorted cookies.','per person',10,'Contains wheat, dairy',3.75,1),
  ('Breaks','Fresh fruit tray','Seasonal sliced fruit and berries.','per person',10,NULL,3.50,2),
  ('Breaks','Vegetable crudite','Seasonal vegetables with ranch and hummus.','per person',10,'Contains dairy, sesame',3.25,3),
  ('Breaks','Chips and salsa','Tortilla chips with salsa and queso.','per person',10,'Contains dairy',2.75,4),
  ('Breaks','Trail mix and granola bars','Individually packaged, good for outdoor events.','per person',10,'Contains tree nuts, peanuts',2.50,5),

  ('Lunch','Deli sandwich buffet','Assorted sandwiches, chips, cookie.','per person',15,'Contains wheat, dairy',10.50,1),
  ('Lunch','Boxed lunch','Sandwich, chips, fruit, cookie. Good for off-site.','per person',10,'Contains wheat, dairy',9.75,2),
  ('Lunch','Soup and salad bar','Two soups, mixed greens, assorted toppings.','per person',20,'Contains dairy',9.00,3),
  ('Lunch','Taco bar','Seasoned beef and chicken, tortillas, full toppings.','per person',25,'Contains dairy',11.25,4),
  ('Lunch','Pasta buffet','Two pastas, marinara and alfredo, salad, garlic bread.','per person',25,'Contains wheat, dairy',10.75,5),
  ('Lunch','Grilled chicken plated','Chicken breast, seasonal vegetable, starch, roll.','per person',20,'Contains wheat',14.50,6),

  ('Dinner','Roast beef buffet','Sliced roast beef, potatoes, vegetable, salad, rolls.','per person',30,'Contains wheat',18.50,1),
  ('Dinner','Chicken two ways','Choice of two preparations, starch, vegetable.','per person',25,'Contains dairy',17.25,2),
  ('Dinner','Plated salmon','Salmon fillet, rice pilaf, seasonal vegetable.','per person',20,'Contains fish',21.00,3),
  ('Dinner','Vegetarian entree','Seasonal vegetable and grain plate.','per person',10,NULL,13.00,4),
  ('Dinner','Carving station','Attended station, choice of protein.','per person',40,NULL,22.50,5),
  ('Dinner','Salad and rolls','Added to any dinner buffet.','per person',20,'Contains wheat, dairy',3.25,6),

  ('Receptions','Passed hors d''oeuvres','Selection of four, butler-passed.','per person',25,'Varies by selection',9.50,1),
  ('Receptions','Cheese and charcuterie','Assorted cheeses, cured meats, crackers, fruit.','per person',20,'Contains dairy, wheat',8.75,2),
  ('Receptions','Slider station','Assorted mini sandwiches.','per person',25,'Contains wheat, dairy',7.50,3),
  ('Receptions','Shrimp cocktail','Chilled shrimp with cocktail sauce.','per person',20,'Contains shellfish',11.00,4),

  ('Beverages','Coffee service','Regular and decaf, cream and sugar.','per person',10,'Contains dairy',2.25,1),
  ('Beverages','Assorted soft drinks','Canned soda and bottled water.','per person',10,NULL,1.75,2),
  ('Beverages','Lemonade or iced tea','Dispensed, self-serve.','per gallon',1,NULL,12.00,3),
  ('Beverages','Hot chocolate bar','Cocoa with marshmallows and toppings.','per person',15,'Contains dairy',3.00,4),

  ('Desserts','Assorted cookies and bars','Chef''s selection.','per person',10,'Contains wheat, dairy, egg',2.75,1),
  ('Desserts','Sheet cake','Serves approximately 24. Custom message available.','each',1,'Contains wheat, dairy, egg',48.00,2),
  ('Desserts','Cheesecake','Plated with seasonal berry compote.','per person',15,'Contains wheat, dairy, egg',5.25,3),
  ('Desserts','Ice cream sundae bar','Vanilla and chocolate with assorted toppings.','per person',20,'Contains dairy, tree nuts',4.50,4);

INSERT INTO menu_items
  (category_id, name, description, unit, minimum_quantity, allergen_notes, sort_order)
SELECT c.id, s.name, s.description, s.unit, s.minimum, s.allergens, s.ord
  FROM seed_items s
  JOIN menu_categories c ON c.name = s.category
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO menu_item_prices (menu_item_id, path, unit_price, effective_from)
SELECT mi.id,
       t.path::financial_path,
       round(s.base_cost * t.multiplier, 2),
       CURRENT_DATE
  FROM seed_items s
  JOIN menu_categories c ON c.name = s.category
  JOIN menu_items mi ON mi.name = s.name AND mi.category_id = c.id
  CROSS JOIN (VALUES
    ('internal_non_revenue',        1.00),
    ('internal_revenue_generating', 1.15),
    ('affiliated_cost_recovery',    1.45),
    ('external_commercial',         2.10)
  ) AS t(path, multiplier);

DROP TABLE seed_items;

-- Fail loudly if this seeded nothing, rather than reporting success
-- on an empty result the way migration 09 did.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM menu_item_prices;
  IF n = 0 THEN
    RAISE EXCEPTION 'Menu seed inserted no prices';
  END IF;
  RAISE NOTICE 'Menu seeded: % price rows', n;
END $$;