-- ============================================================
-- Migration 50 - Add-ons follow the tier, and desserts by the head
--
-- Three corrections.
--
-- 1. An add-on was a flat amount. Guacamole cost an internal
--    department the same dollar it cost an outside customer, while
--    the food it sat on was 30%. Add-ons now scale with the tier
--    like everything else.
--
-- 2. Desserts are sold per person, except the cakes, which are sold
--    whole.
--
-- 3. Several desserts need splitting - 25 chocolate and 25 red
--    velvet for a party of 50 - which the quantity-per-option mode
--    already does elsewhere.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add-ons follow the classification
--
-- price_delta is stored at the external rate, like the menu itself,
-- and scaled at selection time.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION tier_multiplier(p_path financial_path)
RETURNS numeric AS $fn$
  SELECT CASE p_path
           WHEN 'internal_non_revenue'         THEN 0.30
           WHEN 'internal_revenue_generating'  THEN 0.30
           WHEN 'affiliated_cost_recovery'     THEN 0.60
           WHEN 'external_commercial'          THEN 1.00
           ELSE 1.00
         END::numeric;
$fn$ LANGUAGE sql IMMUTABLE;

COMMENT ON COLUMN menu_choice_options.price_delta IS
  'Per person, at the external rate. Scaled to the tier at selection time by tier_multiplier(), so an add-on is discounted the same as the food it sits on.';

-- ------------------------------------------------------------
-- 2. Desserts per person, cakes whole
-- ------------------------------------------------------------

UPDATE menu_items mi
   SET unit = 'per person', minimum_quantity = 10
  FROM menu_categories c
 WHERE c.id = mi.category_id
   AND c.name = 'Desserts'
   AND mi.is_active
   AND mi.name NOT IN (
     'Half Sheet Cake', 'Whole Sheet Cake', 'Double Layer Cake',
     'Buster Barz'
   );

-- The "by the dozen" lines duplicated what the per-person lines now
-- cover, so they are retired rather than left to confuse.
UPDATE menu_items SET is_active = false
 WHERE name IN ('Cookies by the dozen', 'Homemade Bars by the dozen');

-- ------------------------------------------------------------
-- 3. Desserts that can be split across varieties
-- ------------------------------------------------------------

UPDATE menu_choice_groups g
   SET quantity_mode = 'per_option',
       max_select = 3,
       help_text = 'Choose up to three, and how many of each'
  FROM menu_items mi
 WHERE mi.id = g.menu_item_id
   AND mi.name IN ('Mousse in Chocolate Cups', 'Homemade Bars', 'Cookies');

UPDATE menu_choice_groups g
   SET quantity_mode = 'per_option',
       max_select = 2,
       min_select = 1,
       help_text = 'Choose up to two, and how many of each'
  FROM menu_items mi
 WHERE mi.id = g.menu_item_id
   AND mi.name IN ('Double Layer Cake', 'Sundae Bar',
                   'Triple Berry Crisp in Ramekins');

-- Sheet cakes stay a single choice: one cake is one flavour.
UPDATE menu_choice_groups g
   SET quantity_mode = 'none', max_select = 1
  FROM menu_items mi
 WHERE mi.id = g.menu_item_id
   AND mi.name IN ('Half Sheet Cake', 'Whole Sheet Cake');

-- ------------------------------------------------------------
-- 4. A facility charge of zero is a decision, not an absence
--
-- The column was nullable with null meaning "not yet decided", which
-- made an explicit zero indistinguishable from an unanswered
-- question. A separate timestamp records that someone decided.
-- ------------------------------------------------------------

ALTER TABLE event_requests
  ADD COLUMN facility_charge_decided_at timestamptz,
  ADD COLUMN facility_charge_decided_by uuid REFERENCES users(id);

-- Anything already carrying a charge was decided by someone.
UPDATE event_requests
   SET facility_charge_decided_at = updated_at
 WHERE facility_charge_applied IS NOT NULL;

COMMENT ON COLUMN event_requests.facility_charge_applied IS
  'What the room costs for this event. Zero is a valid answer; facility_charge_decided_at says whether anyone has answered yet.';
