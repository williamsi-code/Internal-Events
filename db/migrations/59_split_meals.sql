-- ============================================================
-- Migration 59 - Splitting a meal across two choices
--
-- Fifteen roast beef and fifteen roast turkey is one order, not two.
-- Ordering it as two lines of Comfort Meal works, but it reads as
-- two events on the catering sheet and doubles the minimum.
--
-- The machinery already exists - the boxed sandwiches do exactly
-- this - it was simply never applied to the plated meals.
-- ============================================================

-- Groups where the choice is the food itself, on items priced per
-- person. A party of thirty can reasonably want two of these.
UPDATE menu_choice_groups g
   SET quantity_mode = 'per_option',
       max_select = 2,
       help_text = 'Choose up to two, and how many of each'
  FROM menu_items mi
  JOIN menu_categories c ON c.id = mi.category_id
 WHERE mi.id = g.menu_item_id
   AND mi.unit = 'per person'
   AND c.name <> 'Central Buffet'
   AND g.label IN ('Meat', 'Main', 'Variety', 'Pastry', 'Flavour', 'Topping')
   AND g.max_select = 1;

-- Sides and accompaniments stay single: nobody wants half the room
-- on green beans and half on corn, and the kitchen would rather know
-- that now than on the day.
--
-- Only where the group asks for one to begin with. Dutch Picnic's
-- "two sides" means two, and narrowing it to one would contradict
-- what the menu card promises.
UPDATE menu_choice_groups g
   SET quantity_mode = 'none', max_select = 1
  FROM menu_items mi
 WHERE mi.id = g.menu_item_id
   AND g.label IN ('Vegetable', 'Roll', 'Side', 'Greens', 'Dressings')
   AND g.min_select <= 1;

-- Groups that ask for several sides keep their count but stop
-- carrying quantities: two sides for everyone, not two sides split
-- between them.
UPDATE menu_choice_groups g
   SET quantity_mode = 'none'
  FROM menu_items mi
 WHERE mi.id = g.menu_item_id
   AND g.label IN ('Sides', 'Vegetables', 'Starches', 'Salads')
   AND g.quantity_mode = 'per_option';

-- The buffets are untouched on purpose. "One entree included" is
-- what the price buys; splitting it would change the deal rather
-- than the order.

-- ------------------------------------------------------------
-- Does the split add up?
--
-- Advisory rather than enforced: a requester who orders thirty
-- meals and splits them fifteen and fourteen has made a mistake, but
-- refusing the save is the wrong way to tell them.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION selection_split_mismatch(p_request_id uuid)
RETURNS TABLE (
  menu_item text,
  group_label text,
  ordered integer,
  allocated integer
) AS $fn$
  SELECT mi.name,
         g.label,
         sel.quantity,
         coalesce(sum(sc.quantity), 0)::integer
    FROM request_menu_selections sel
    JOIN menu_items mi ON mi.id = sel.menu_item_id
    JOIN menu_choice_groups g ON g.menu_item_id = mi.id
                             AND g.quantity_mode = 'per_option'
    LEFT JOIN menu_choice_options o ON o.group_id = g.id
    LEFT JOIN selection_choices sc
           ON sc.option_id = o.id AND sc.selection_id = sel.id
   WHERE sel.request_id = p_request_id
   GROUP BY mi.name, g.label, g.id, sel.quantity
  HAVING coalesce(sum(sc.quantity), 0) <> sel.quantity
     AND coalesce(sum(sc.quantity), 0) > 0;
$fn$ LANGUAGE sql STABLE;
