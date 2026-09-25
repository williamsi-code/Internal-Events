-- ============================================================
-- Migration 61 - The catering operation
--
-- Four things that belong together: who we cook for, what we cook,
-- what we cook it from, and when it has to be ready.
--
-- The order matters. Recipes reference ingredients, production
-- references recipes, and everything eventually references a
-- customer. Built the other way round, each piece needs rewriting
-- when the next arrives.
--
-- This migration is the data model only. It creates nothing anyone
-- can see yet, deliberately: a schema that has to change once the
-- screens exist is worse than one that waited.
-- ============================================================

-- ============================================================
-- 1. Customers
--
-- event_requests already carries a name, an email and a department.
-- That works for one event and fails at the second: the same church
-- booking three times a year is three unconnected rows, and nobody
-- can see they are a regular.
-- ============================================================

CREATE TYPE customer_kind AS ENUM (
  'department',      -- a Central department
  'student_org',     -- a recognized student organization
  'affiliated',      -- alumni, foundation, partner
  'business',        -- an outside company
  'individual',      -- a private customer, usually a wedding
  'nonprofit'
);

CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            customer_kind NOT NULL,
  name            text NOT NULL,
  -- What they are called when it differs from the legal name.
  trading_name    text,

  billing_address text,
  billing_email   citext,
  billing_account text,
  tax_exempt      boolean NOT NULL DEFAULT false,
  tax_exempt_ref  text,

  -- Things worth knowing before the next conversation rather than
  -- during it.
  notes           text,
  dietary_notes   text,
  access_notes    text,

  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id)
);

CREATE INDEX ON customers (lower(name));
CREATE INDEX ON customers (kind) WHERE is_active;

CREATE TABLE customer_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id),
  full_name     text NOT NULL,
  role          text,
  email         citext,
  phone         text,
  is_primary    boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON customer_contacts (customer_id);
CREATE INDEX ON customer_contacts (email);

-- One primary contact per customer, enforced rather than hoped for.
CREATE UNIQUE INDEX ON customer_contacts (customer_id)
  WHERE is_primary;

ALTER TABLE event_requests
  ADD COLUMN customer_id uuid REFERENCES customers(id),
  ADD COLUMN customer_contact_id uuid REFERENCES customer_contacts(id);

CREATE INDEX ON event_requests (customer_id);

-- What a customer is worth and how they behave, which is what the
-- events office actually wants to know before picking up the phone.
CREATE OR REPLACE VIEW customer_history AS
SELECT
  c.id,
  c.name,
  c.kind::text,
  count(r.id) AS events,
  count(r.id) FILTER (
    WHERE r.event_date > CURRENT_DATE - INTERVAL '1 year'
  ) AS events_this_year,
  coalesce(sum(quoted_total(r.id)), 0) AS lifetime_value,
  coalesce(sum(quoted_total(r.id)) FILTER (
    WHERE r.event_date > CURRENT_DATE - INTERVAL '1 year'
  ), 0) AS value_this_year,
  max(r.event_date) FILTER (WHERE r.event_date <= CURRENT_DATE)
    AS last_event,
  min(r.event_date) FILTER (WHERE r.event_date > CURRENT_DATE)
    AS next_event,
  count(*) FILTER (WHERE r.status = 'cancelled') AS cancellations
FROM customers c
LEFT JOIN event_requests r
       ON r.customer_id = c.id
      AND r.status NOT IN ('draft', 'denied')
GROUP BY c.id, c.name, c.kind;

-- ============================================================
-- 2. Inventory
--
-- Units are the part that goes wrong. A recipe asks for 2 cups of
-- cream; the invoice is in gallons; the walk-in count is in
-- quarts. Everything is therefore stored in one base unit per
-- ingredient and converted at the edges.
-- ============================================================

CREATE TYPE unit_system AS ENUM ('weight', 'volume', 'count');

CREATE TABLE units (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  system      unit_system NOT NULL,
  -- How many base units this is. Base is grams, millilitres, or one.
  to_base     numeric(14,6) NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);

INSERT INTO units (code, label, system, to_base, sort_order) VALUES
  ('g',     'grams',       'weight', 1,        1),
  ('kg',    'kilograms',   'weight', 1000,     2),
  ('oz',    'ounces',      'weight', 28.3495,  3),
  ('lb',    'pounds',      'weight', 453.592,  4),

  ('ml',    'millilitres', 'volume', 1,        10),
  ('l',     'litres',      'volume', 1000,     11),
  ('tsp',   'teaspoons',   'volume', 4.92892,  12),
  ('tbsp',  'tablespoons', 'volume', 14.7868,  13),
  ('floz',  'fluid ounces','volume', 29.5735,  14),
  ('cup',   'cups',        'volume', 236.588,  15),
  ('pt',    'pints',       'volume', 473.176,  16),
  ('qt',    'quarts',      'volume', 946.353,  17),
  ('gal',   'gallons',     'volume', 3785.41,  18),

  ('each',  'each',        'count',  1,        20),
  ('dozen', 'dozen',       'count',  12,       21),
  ('case',  'cases',       'count',  1,        22),
  ('bunch', 'bunches',     'count',  1,        23);

-- Convert between units of the same system. Refuses across systems,
-- because grams to cups depends on what is in the cup.
CREATE OR REPLACE FUNCTION convert_unit(
  p_amount numeric,
  p_from text,
  p_to text
) RETURNS numeric AS $fn$
DECLARE
  f record;
  t record;
BEGIN
  SELECT to_base, system INTO f FROM units WHERE code = p_from;
  SELECT to_base, system INTO t FROM units WHERE code = p_to;

  IF f IS NULL OR t IS NULL THEN
    RAISE EXCEPTION 'Unknown unit: % or %', p_from, p_to;
  END IF;

  IF f.system <> t.system THEN
    RAISE EXCEPTION
      'Cannot convert % to %: one is %, the other is %. That needs a density.',
      p_from, p_to, f.system, t.system;
  END IF;

  RETURN p_amount * f.to_base / t.to_base;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  account_ref   text,
  contact_name  text,
  contact_email citext,
  contact_phone text,
  -- Which days they deliver, 0 = Sunday.
  delivery_days integer[] NOT NULL DEFAULT '{}',
  lead_time_days integer NOT NULL DEFAULT 1,
  minimum_order numeric(10,2),
  notes         text,
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TYPE storage_kind AS ENUM (
  'dry', 'refrigerated', 'frozen', 'chemical', 'equipment'
);

CREATE TABLE ingredients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  category        text,
  storage         storage_kind NOT NULL DEFAULT 'dry',

  -- Everything about this ingredient is counted in this unit.
  base_unit       text NOT NULL REFERENCES units(code),
  -- What we usually buy it in, for the shopping list.
  purchase_unit   text REFERENCES units(code),
  purchase_size   numeric(12,4),

  -- Below this, it goes on the list. Zero means we do not track it.
  par_level       numeric(12,3) NOT NULL DEFAULT 0,
  reorder_to      numeric(12,3),

  last_cost       numeric(12,4),
  supplier_id     uuid REFERENCES suppliers(id),

  -- The nine that have to be declared, plus whatever else matters.
  allergens       text[] NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (name)
);

CREATE INDEX ON ingredients (category) WHERE is_active;
CREATE INDEX ON ingredients (storage) WHERE is_active;

CREATE TYPE movement_kind AS ENUM (
  'received',    -- came in from a supplier
  'used',        -- went into an event
  'wasted',      -- spoiled, dropped, burnt
  'counted',     -- a stocktake correction
  'transferred', -- to or from another kitchen
  'returned'     -- went back to the supplier
);

-- Every change to stock, never a running total that can drift.
-- The on-hand figure is the sum, which means a mistake can be found
-- rather than merely corrected.
CREATE TABLE stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  kind          movement_kind NOT NULL,
  -- In the ingredient's base unit. Negative takes stock away.
  quantity      numeric(14,4) NOT NULL,
  unit_cost     numeric(12,4),

  request_id    uuid REFERENCES event_requests(id) ON DELETE SET NULL,
  supplier_id   uuid REFERENCES suppliers(id),
  invoice_ref   text,
  expires_on    date,

  note          text,
  moved_at      timestamptz NOT NULL DEFAULT now(),
  moved_by      uuid REFERENCES users(id),

  CHECK (quantity <> 0)
);

CREATE INDEX ON stock_movements (ingredient_id, moved_at DESC);
CREATE INDEX ON stock_movements (request_id);
CREATE INDEX ON stock_movements (moved_at DESC);

CREATE OR REPLACE VIEW ingredient_stock AS
SELECT
  i.id,
  i.name,
  i.category,
  i.storage::text,
  i.base_unit,
  i.par_level,
  i.reorder_to,
  i.last_cost,
  i.allergens,
  s.name AS supplier_name,
  coalesce(sum(m.quantity), 0) AS on_hand,
  coalesce(sum(m.quantity), 0) * coalesce(i.last_cost, 0) AS stock_value,
  CASE
    WHEN i.par_level = 0 THEN false
    ELSE coalesce(sum(m.quantity), 0) < i.par_level
  END AS below_par,
  max(m.moved_at) AS last_movement,
  min(m.expires_on) FILTER (
    WHERE m.kind = 'received' AND m.expires_on >= CURRENT_DATE
  ) AS next_expiry
FROM ingredients i
LEFT JOIN stock_movements m ON m.ingredient_id = i.id
LEFT JOIN suppliers s ON s.id = i.supplier_id
WHERE i.is_active
GROUP BY i.id, s.name;

-- ============================================================
-- 3. Recipes
--
-- A recipe turns a menu item into ingredients, which is what makes
-- scaling and costing possible. A recipe can also be an ingredient
-- of another recipe: a sauce is made once and used in four dishes.
-- ============================================================

CREATE TABLE recipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  -- The menu item this produces, where there is one. A sub-recipe
  -- like a stock or a sauce has none.
  menu_item_id    uuid REFERENCES menu_items(id) ON DELETE SET NULL,

  -- What one batch makes.
  yield_quantity  numeric(12,3) NOT NULL,
  yield_unit      text NOT NULL REFERENCES units(code),
  -- How many people a batch serves, where that differs from yield.
  serves          integer,

  prep_minutes    integer,
  cook_minutes    integer,
  rest_minutes    integer,

  method          text,
  chef_notes      text,
  -- Things that only matter at scale: which oven, which mixer.
  scale_notes     text,

  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id),

  UNIQUE (name)
);

CREATE INDEX ON recipes (menu_item_id);

CREATE TABLE recipe_components (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id      uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

  -- Exactly one of these. An ingredient, or another recipe.
  ingredient_id  uuid REFERENCES ingredients(id),
  sub_recipe_id  uuid REFERENCES recipes(id),

  quantity       numeric(12,4) NOT NULL,
  unit           text NOT NULL REFERENCES units(code),
  preparation    text,          -- "diced", "at room temperature"
  is_optional    boolean NOT NULL DEFAULT false,
  sort_order     integer NOT NULL DEFAULT 0,

  CHECK (
    (ingredient_id IS NOT NULL AND sub_recipe_id IS NULL)
    OR (ingredient_id IS NULL AND sub_recipe_id IS NOT NULL)
  ),
  -- A recipe cannot contain itself. Deeper loops are caught when
  -- costing rather than here.
  CHECK (sub_recipe_id IS DISTINCT FROM recipe_id)
);

CREATE INDEX ON recipe_components (recipe_id, sort_order);
CREATE INDEX ON recipe_components (ingredient_id);
CREATE INDEX ON recipe_components (sub_recipe_id);

CREATE TABLE recipe_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  instruction text NOT NULL,
  minutes     integer,
  station     text,
  UNIQUE (recipe_id, step_number)
);

-- What a recipe costs, following sub-recipes down. Depth-limited
-- because a cycle would otherwise recurse forever, and a kitchen
-- does not nest sauces eight deep.
CREATE OR REPLACE FUNCTION recipe_cost(p_recipe_id uuid, p_depth integer DEFAULT 0)
RETURNS numeric AS $fn$
DECLARE
  total numeric := 0;
  c record;
BEGIN
  IF p_depth > 6 THEN
    RAISE EXCEPTION 'Recipe nesting too deep - check for a loop';
  END IF;

  FOR c IN
    SELECT rc.ingredient_id, rc.sub_recipe_id, rc.quantity, rc.unit,
           i.base_unit, i.last_cost,
           sr.yield_quantity, sr.yield_unit
      FROM recipe_components rc
      LEFT JOIN ingredients i ON i.id = rc.ingredient_id
      LEFT JOIN recipes sr ON sr.id = rc.sub_recipe_id
     WHERE rc.recipe_id = p_recipe_id
       AND NOT rc.is_optional
  LOOP
    IF c.ingredient_id IS NOT NULL THEN
      total := total + coalesce(c.last_cost, 0) *
        convert_unit(c.quantity, c.unit, c.base_unit);
    ELSE
      -- A proportion of the sub-recipe's batch.
      total := total + recipe_cost(c.sub_recipe_id, p_depth + 1) *
        (convert_unit(c.quantity, c.unit, c.yield_unit) / c.yield_quantity);
    END IF;
  END LOOP;

  RETURN round(total, 4);
END;
$fn$ LANGUAGE plpgsql STABLE;

-- What a recipe needs, flattened to ingredients, scaled to a
-- quantity. This is the shopping list and the prep list both.
CREATE OR REPLACE FUNCTION recipe_ingredients_flat(
  p_recipe_id uuid,
  p_scale numeric DEFAULT 1
) RETURNS TABLE (
  ingredient_id uuid,
  ingredient_name text,
  quantity numeric,
  unit text,
  storage text
) AS $fn$
  WITH RECURSIVE walk AS (
    SELECT rc.ingredient_id, rc.sub_recipe_id,
           rc.quantity * p_scale AS quantity, rc.unit, 1 AS depth
      FROM recipe_components rc
     WHERE rc.recipe_id = p_recipe_id

    UNION ALL

    SELECT rc.ingredient_id, rc.sub_recipe_id,
           rc.quantity * w.quantity /
             NULLIF(convert_unit(sr.yield_quantity, sr.yield_unit, w.unit), 0),
           rc.unit, w.depth + 1
      FROM walk w
      JOIN recipes sr ON sr.id = w.sub_recipe_id
      JOIN recipe_components rc ON rc.recipe_id = sr.id
     WHERE w.sub_recipe_id IS NOT NULL
       AND w.depth < 6
  )
  SELECT i.id, i.name,
         round(sum(convert_unit(w.quantity, w.unit, i.base_unit)), 3),
         i.base_unit,
         i.storage::text
    FROM walk w
    JOIN ingredients i ON i.id = w.ingredient_id
   WHERE w.ingredient_id IS NOT NULL
   GROUP BY i.id, i.name, i.base_unit, i.storage
   ORDER BY i.storage, i.name;
$fn$ LANGUAGE sql STABLE;

-- ============================================================
-- 4. Production
--
-- The room scheduler answers "is the Vermeer free". This answers
-- "can the kitchen do three events on Saturday", which is a
-- different question with a different shape: tasks against time and
-- people, not bookings against rooms.
-- ============================================================

CREATE TYPE production_state AS ENUM (
  'planned', 'in_progress', 'done', 'cancelled'
);

CREATE TABLE kitchen_stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  -- How many things can be in progress here at once.
  capacity    integer NOT NULL DEFAULT 1,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO kitchen_stations (name, capacity, sort_order) VALUES
  ('Ovens', 6, 1),
  ('Range', 6, 2),
  ('Cold prep', 4, 3),
  ('Bakery', 2, 4),
  ('Plating', 8, 5),
  ('Packing', 4, 6);

CREATE TABLE production_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid REFERENCES event_requests(id) ON DELETE CASCADE,
  recipe_id     uuid REFERENCES recipes(id),
  menu_item_id  uuid REFERENCES menu_items(id),

  title         text NOT NULL,
  quantity      numeric(12,3),
  unit          text REFERENCES units(code),

  station_id    uuid REFERENCES kitchen_stations(id),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,

  state         production_state NOT NULL DEFAULT 'planned',
  assigned_to   uuid REFERENCES users(id),
  note          text,

  started_at    timestamptz,
  completed_at  timestamptz,
  completed_by  uuid REFERENCES users(id),

  created_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at)
);

CREATE INDEX ON production_tasks (starts_at);
CREATE INDEX ON production_tasks (request_id);
CREATE INDEX ON production_tasks (station_id, starts_at);
CREATE INDEX ON production_tasks (state) WHERE state <> 'done';

-- What happens away from the kitchen: loading, travelling, serving,
-- clearing. These are the ones that collide with the room schedule.
CREATE TYPE service_kind AS ENUM (
  'load', 'travel', 'setup', 'service', 'teardown', 'return'
);

CREATE TABLE service_windows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  kind        service_kind NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  staff_count integer NOT NULL DEFAULT 1,
  note        text,

  CHECK (ends_at > starts_at)
);

CREATE INDEX ON service_windows (starts_at);
CREATE INDEX ON service_windows (request_id);

-- Does the catering plan fit inside the room booking?
--
-- An on-campus event has a room held from setup to teardown. If the
-- catering wants the room before it is held, somebody finds out at
-- 6am with a van full of chafing dishes.
CREATE OR REPLACE VIEW service_room_conflicts AS
SELECT
  sw.id AS window_id,
  sw.request_id,
  r.reference_code,
  r.event_name,
  sw.kind::text,
  sw.starts_at,
  sw.ends_at,
  b.starts_at AS room_from,
  b.ends_at AS room_until,
  s.name AS space_name,
  CASE
    WHEN sw.starts_at < b.starts_at THEN 'Catering starts before the room is held'
    WHEN sw.ends_at > b.ends_at THEN 'Catering runs past the room booking'
    ELSE 'Outside the room booking'
  END AS problem
FROM service_windows sw
JOIN event_requests r ON r.id = sw.request_id
JOIN bookings b ON b.request_id = r.id AND b.status <> 'released'
JOIN spaces s ON s.id = b.space_id
WHERE sw.kind IN ('setup', 'service', 'teardown')
  AND (sw.starts_at < b.starts_at OR sw.ends_at > b.ends_at);

-- How much is on the kitchen at once.
CREATE OR REPLACE VIEW kitchen_load AS
WITH days AS (
  SELECT d::date AS day
    FROM generate_series(
           CURRENT_DATE - INTERVAL '30 days',
           CURRENT_DATE + INTERVAL '120 days',
           INTERVAL '1 day'
         ) d
),
-- Service hours are aggregated separately and joined, rather than
-- computed in a subquery against the day column: a correlated
-- subquery cannot see a grouped expression.
service AS (
  SELECT (sw.starts_at AT TIME ZONE 'America/Chicago')::date AS day,
         sum(sw.staff_count *
             EXTRACT(epoch FROM (sw.ends_at - sw.starts_at)) / 3600.0)
           AS service_hours,
         sum(sw.staff_count) AS service_staff
    FROM service_windows sw
   GROUP BY 1
),
production AS (
  SELECT (t.starts_at AT TIME ZONE 'America/Chicago')::date AS day,
         count(DISTINCT t.request_id) AS events,
         count(t.id) AS tasks,
         count(t.id) FILTER (WHERE t.state = 'done') AS tasks_done,
         sum(EXTRACT(epoch FROM (t.ends_at - t.starts_at)) / 3600.0)
           AS task_hours
    FROM production_tasks t
   WHERE t.state <> 'cancelled'
   GROUP BY 1
)
SELECT
  d.day,
  coalesce(p.events, 0) AS events,
  coalesce(p.tasks, 0) AS tasks,
  coalesce(p.tasks_done, 0) AS tasks_done,
  coalesce(p.task_hours, 0) AS task_hours,
  coalesce(s.service_hours, 0) AS service_hours,
  coalesce(s.service_staff, 0) AS service_staff,
  coalesce(p.task_hours, 0) + coalesce(s.service_hours, 0) AS total_hours
FROM days d
LEFT JOIN production p ON p.day = d.day
LEFT JOIN service s ON s.day = d.day;

-- ============================================================
-- Linking it together
-- ============================================================

-- What an event needs from the store, from its menu selections.
CREATE OR REPLACE FUNCTION event_ingredients(p_request_id uuid)
RETURNS TABLE (
  ingredient_id uuid,
  ingredient_name text,
  quantity numeric,
  unit text,
  storage text,
  on_hand numeric,
  short_by numeric
) AS $fn$
  WITH needed AS (
    SELECT f.ingredient_id, f.ingredient_name, f.unit, f.storage,
           sum(f.quantity) AS quantity
      FROM request_menu_selections sel
      JOIN recipes rc ON rc.menu_item_id = sel.menu_item_id
                     AND rc.is_active
      CROSS JOIN LATERAL recipe_ingredients_flat(
        rc.id,
        sel.quantity::numeric / NULLIF(coalesce(rc.serves, 1), 0)
      ) f
     WHERE sel.request_id = p_request_id
     GROUP BY f.ingredient_id, f.ingredient_name, f.unit, f.storage
  )
  SELECT n.ingredient_id, n.ingredient_name, n.quantity, n.unit, n.storage,
         coalesce(st.on_hand, 0),
         greatest(n.quantity - coalesce(st.on_hand, 0), 0)
    FROM needed n
    LEFT JOIN ingredient_stock st ON st.id = n.ingredient_id
   ORDER BY n.storage, n.ingredient_name;
$fn$ LANGUAGE sql STABLE;

-- What to buy: below par, or needed for something coming up.
CREATE OR REPLACE VIEW shopping_list AS
SELECT
  st.id,
  st.name,
  st.category,
  st.storage,
  st.base_unit,
  st.on_hand,
  st.par_level,
  coalesce(st.reorder_to, st.par_level) - st.on_hand AS suggested_order,
  st.supplier_name,
  st.last_cost,
  (coalesce(st.reorder_to, st.par_level) - st.on_hand) * coalesce(st.last_cost, 0)
    AS estimated_cost
FROM ingredient_stock st
WHERE st.below_par
ORDER BY st.supplier_name NULLS LAST, st.storage, st.name;
