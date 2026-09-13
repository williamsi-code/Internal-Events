-- ============================================================
-- Migration 47 - Make the Fall 2026 prices live, and close the
--                overlapping rows
--
-- Migration 45 dated every price from tomorrow. That is right for a
-- price change - a quote given today should stand - but wrong for a
-- menu being loaded for the first time, which then reads as
-- unpriced until midnight.
--
-- Separately, reapply_pricing_tiers was inserting a second open row
-- for items whose price had not changed instead of leaving the
-- existing one alone, so some items have two rows covering the same
-- dates.
-- ============================================================

-- ------------------------------------------------------------
-- 1. One open row per item and path, keeping the newest
-- ------------------------------------------------------------

DELETE FROM menu_item_prices
 WHERE id IN (
   SELECT id FROM (
     SELECT id,
            row_number() OVER (
              PARTITION BY menu_item_id, path
              ORDER BY effective_from DESC, id DESC
            ) AS rn
       FROM menu_item_prices
      WHERE effective_to IS NULL
   ) ranked
    WHERE rn > 1
 );

-- ------------------------------------------------------------
-- 2. Bring the new menu forward to today
-- ------------------------------------------------------------

DELETE FROM menu_item_prices
 WHERE effective_to IS NOT NULL
   AND effective_to <= CURRENT_DATE;

UPDATE menu_item_prices
   SET effective_from = CURRENT_DATE
 WHERE effective_from > CURRENT_DATE;

DELETE FROM menu_item_prices
 WHERE effective_to IS NOT NULL
   AND effective_to <= effective_from;

-- ------------------------------------------------------------
-- 3. Stop the duplicate rows recurring
--
-- Tagged with a named delimiter rather than the bare one, which
-- this migration runner would not parse.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION reapply_pricing_tiers()
RETURNS integer AS $fn$
DECLARE
  n integer := 0;
  r record;
  target numeric;
BEGIN
  FOR r IN
    SELECT mi.id AS item_id,
           t.path,
           t.multiplier,
           ext.unit_price AS external_price,
           cur.id AS current_id,
           cur.unit_price AS current_price,
           cur.effective_from AS current_from
      FROM menu_items mi
      JOIN LATERAL (
        SELECT unit_price FROM menu_item_prices p
         WHERE p.menu_item_id = mi.id
           AND p.path = 'external_commercial'
           AND p.effective_from <= CURRENT_DATE
           AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
         ORDER BY p.effective_from DESC LIMIT 1
      ) ext ON true
      CROSS JOIN (
        VALUES
          ('internal_non_revenue'::financial_path, 0.30::numeric),
          ('internal_revenue_generating'::financial_path, 0.30::numeric),
          ('affiliated_cost_recovery'::financial_path, 0.60::numeric),
          ('external_commercial'::financial_path, 1.00::numeric)
      ) AS t(path, multiplier)
      LEFT JOIN LATERAL (
        SELECT id, unit_price, effective_from
          FROM menu_item_prices p
         WHERE p.menu_item_id = mi.id
           AND p.path = t.path
           AND p.effective_to IS NULL
         ORDER BY p.effective_from DESC LIMIT 1
      ) cur ON true
     WHERE mi.is_active
  LOOP
    target := round(r.external_price * r.multiplier, 2);

    IF r.current_price IS NOT NULL
       AND abs(r.current_price - target) < 0.005 THEN
      CONTINUE;
    END IF;

    IF r.current_id IS NOT NULL AND r.current_from > CURRENT_DATE THEN
      UPDATE menu_item_prices SET unit_price = target WHERE id = r.current_id;
      n := n + 1;
      CONTINUE;
    END IF;

    IF r.current_id IS NOT NULL THEN
      UPDATE menu_item_prices
         SET effective_to = CURRENT_DATE + 1
       WHERE id = r.current_id;
    END IF;

    INSERT INTO menu_item_prices
      (menu_item_id, path, unit_price, effective_from)
    VALUES (r.item_id, r.path, target, CURRENT_DATE + 1);

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$fn$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 4. The two items priced per tier rather than by the rule
-- ------------------------------------------------------------

SELECT set_tier_prices('Bakery Donut Holes', 4.00, 6.00, 8.00);
SELECT set_tier_prices('Bakery Dutch Letter', 3.50, 4.50, 5.50);

UPDATE menu_item_prices
   SET effective_from = CURRENT_DATE
 WHERE effective_from > CURRENT_DATE;

DELETE FROM menu_item_prices
 WHERE effective_to IS NOT NULL
   AND effective_to <= effective_from;
