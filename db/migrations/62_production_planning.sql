-- ============================================================
-- Migration 62 - Planning the kitchen's day
--
-- The room scheduler answers "is the Vermeer free". This answers
-- "can the kitchen do three events on Saturday", which is tasks
-- against time and people rather than bookings against rooms.
--
-- Tasks are generated from the menu where a recipe exists, working
-- backwards from when the food has to be out. Where no recipe
-- exists, a placeholder task is made anyway - the kitchen still has
-- to cook it, and a plan missing half the work is worse than one
-- that admits what it does not know.
-- ============================================================

-- When the food has to be ready, taken from the event or the
-- service window if one has been set.
CREATE OR REPLACE FUNCTION service_time(p_request_id uuid)
RETURNS timestamptz AS $fn$
  SELECT coalesce(
    (SELECT min(sw.starts_at) FROM service_windows sw
      WHERE sw.request_id = p_request_id AND sw.kind = 'service'),
    (SELECT (r.event_date + coalesce(r.start_time, TIME '12:00'))
              AT TIME ZONE 'America/Chicago'
       FROM event_requests r WHERE r.id = p_request_id)
  );
$fn$ LANGUAGE sql STABLE;

-- Build the production plan for an event.
--
-- Everything is scheduled to finish by service and start as late as
-- it reasonably can: food held for three hours is food nobody
-- enjoys. Cold prep is the exception and is pulled earlier, because
-- it keeps and because it clears the morning.
CREATE OR REPLACE FUNCTION plan_production(
  p_request_id uuid,
  p_user uuid
) RETURNS integer AS $fn$
DECLARE
  serve_at timestamptz;
  sel record;
  n integer := 0;
  station_id uuid;
  duration integer;
  starts timestamptz;
  ends timestamptz;
  batches numeric;
BEGIN
  serve_at := service_time(p_request_id);
  IF serve_at IS NULL THEN
    RAISE EXCEPTION 'That event has no date to plan against';
  END IF;

  -- Replanning replaces what has not been started. Anything already
  -- under way or finished stays: the kitchen's record of what it did
  -- is not the planner's to rewrite.
  DELETE FROM production_tasks
   WHERE request_id = p_request_id
     AND state = 'planned';

  FOR sel IN
    SELECT s.menu_item_id, s.quantity, mi.name AS item_name,
           mi.unit AS item_unit,
           r.id AS recipe_id, r.name AS recipe_name,
           r.serves, r.prep_minutes, r.cook_minutes, r.rest_minutes,
           r.yield_quantity, r.yield_unit
      FROM request_menu_selections s
      JOIN menu_items mi ON mi.id = s.menu_item_id
      LEFT JOIN recipes r ON r.menu_item_id = mi.id AND r.is_active
     WHERE s.request_id = p_request_id
  LOOP
    -- How many batches. Without a recipe we cannot know, so one task
    -- stands for the whole line and the chef sizes it.
    batches := CASE
      WHEN sel.serves > 0 THEN ceil(sel.quantity::numeric / sel.serves)
      ELSE 1
    END;

    -- Cooking, where there is any.
    IF coalesce(sel.cook_minutes, 0) > 0 THEN
      SELECT id INTO station_id FROM kitchen_stations
       WHERE name = 'Ovens' AND is_active LIMIT 1;

      duration := greatest(
        coalesce(sel.cook_minutes, 30) * greatest(ceil(batches / 4), 1),
        15
      );
      ends := serve_at - (coalesce(sel.rest_minutes, 10) || ' minutes')::interval;
      starts := ends - (duration || ' minutes')::interval;

      INSERT INTO production_tasks
        (request_id, recipe_id, menu_item_id, title, quantity, unit,
         station_id, starts_at, ends_at, note)
      VALUES
        (p_request_id, sel.recipe_id, sel.menu_item_id,
         'Cook ' || sel.item_name,
         sel.quantity, sel.item_unit,
         station_id, starts, ends,
         CASE WHEN sel.recipe_id IS NULL
              THEN 'No recipe yet - times are a guess'
              ELSE batches || ' batch' ||
                   CASE WHEN batches = 1 THEN '' ELSE 'es' END
         END);
      n := n + 1;
    END IF;

    -- Prep, finishing before the cook starts.
    IF coalesce(sel.prep_minutes, 0) > 0 OR sel.recipe_id IS NULL THEN
      SELECT id INTO station_id FROM kitchen_stations
       WHERE name = 'Cold prep' AND is_active LIMIT 1;

      duration := greatest(
        coalesce(sel.prep_minutes, 20) * greatest(ceil(batches / 4), 1),
        15
      );
      -- Prep lands the morning of, not the night before, unless the
      -- cook starts early enough to need it sooner.
      ends := least(
        serve_at - (coalesce(sel.cook_minutes, 0) + 30 || ' minutes')::interval,
        date_trunc('day', serve_at AT TIME ZONE 'America/Chicago')
          AT TIME ZONE 'America/Chicago' + INTERVAL '11 hours'
      );
      starts := ends - (duration || ' minutes')::interval;

      INSERT INTO production_tasks
        (request_id, recipe_id, menu_item_id, title, quantity, unit,
         station_id, starts_at, ends_at, note)
      VALUES
        (p_request_id, sel.recipe_id, sel.menu_item_id,
         'Prep ' || sel.item_name,
         sel.quantity, sel.item_unit,
         station_id, starts, ends,
         CASE WHEN sel.recipe_id IS NULL
              THEN 'No recipe yet - times are a guess'
              ELSE NULL END);
      n := n + 1;
    END IF;
  END LOOP;

  -- One plating task for the lot, which is how it actually happens.
  IF n > 0 THEN
    SELECT id INTO station_id FROM kitchen_stations
     WHERE name = 'Plating' AND is_active LIMIT 1;

    INSERT INTO production_tasks
      (request_id, title, station_id, starts_at, ends_at, note)
    VALUES
      (p_request_id, 'Plate and load', station_id,
       serve_at - INTERVAL '45 minutes',
       serve_at - INTERVAL '10 minutes',
       'Everything together');
    n := n + 1;
  END IF;

  RETURN n;
END;
$fn$ LANGUAGE plpgsql;

-- Default service windows from the event, so the catering day has a
-- shape before anyone edits it.
CREATE OR REPLACE FUNCTION plan_service_windows(
  p_request_id uuid
) RETURNS integer AS $fn$
DECLARE
  r record;
  starts timestamptz;
  ends timestamptz;
  n integer := 0;
BEGIN
  SELECT event_date, start_time, end_time, estimated_attendance,
         final_attendance
    INTO r
    FROM event_requests WHERE id = p_request_id;

  IF r IS NULL OR r.start_time IS NULL THEN RETURN 0; END IF;

  starts := (r.event_date + r.start_time) AT TIME ZONE 'America/Chicago';
  ends := (r.event_date + coalesce(r.end_time, r.start_time + INTERVAL '2 hours'))
            AT TIME ZONE 'America/Chicago';

  DELETE FROM service_windows WHERE request_id = p_request_id;

  -- Setup: an hour, longer for a big one.
  INSERT INTO service_windows (request_id, kind, starts_at, ends_at, staff_count)
  VALUES (
    p_request_id, 'setup',
    starts - CASE
      WHEN coalesce(r.final_attendance, r.estimated_attendance, 0) > 100
        THEN INTERVAL '2 hours' ELSE INTERVAL '1 hour' END,
    starts,
    greatest(ceil(coalesce(r.final_attendance, r.estimated_attendance, 20) / 50.0), 1)
  );
  n := n + 1;

  INSERT INTO service_windows (request_id, kind, starts_at, ends_at, staff_count)
  VALUES (
    p_request_id, 'service', starts, ends,
    greatest(ceil(coalesce(r.final_attendance, r.estimated_attendance, 20) / 30.0), 1)
  );
  n := n + 1;

  INSERT INTO service_windows (request_id, kind, starts_at, ends_at, staff_count)
  VALUES (
    p_request_id, 'teardown', ends, ends + INTERVAL '1 hour',
    greatest(ceil(coalesce(r.final_attendance, r.estimated_attendance, 20) / 50.0), 1)
  );
  n := n + 1;

  RETURN n;
END;
$fn$ LANGUAGE plpgsql;

-- The day, as the kitchen needs to see it.
CREATE OR REPLACE VIEW production_day AS
SELECT
  t.id,
  t.request_id,
  r.reference_code,
  r.event_name,
  coalesce(cu.name, r.department_org) AS customer_name,
  t.title,
  t.quantity,
  t.unit,
  t.note,
  t.state::text,
  ks.name AS station_name,
  ks.id AS station_id,
  ks.sort_order AS station_order,
  t.starts_at,
  t.ends_at,
  (t.starts_at AT TIME ZONE 'America/Chicago')::date AS day,
  (extract(hour from t.starts_at AT TIME ZONE 'America/Chicago') * 60
   + extract(minute from t.starts_at AT TIME ZONE 'America/Chicago'))::int
    AS start_minutes,
  (extract(hour from t.ends_at AT TIME ZONE 'America/Chicago') * 60
   + extract(minute from t.ends_at AT TIME ZONE 'America/Chicago'))::int
    AS end_minutes,
  u.full_name AS assigned_to_name,
  t.assigned_to,
  s.name AS space_name,
  (t.recipe_id IS NULL) AS no_recipe
FROM production_tasks t
LEFT JOIN event_requests r ON r.id = t.request_id
LEFT JOIN customers cu ON cu.id = r.customer_id
LEFT JOIN kitchen_stations ks ON ks.id = t.station_id
LEFT JOIN users u ON u.id = t.assigned_to
LEFT JOIN spaces s ON s.id = r.space_id
WHERE t.state <> 'cancelled';

-- Service work for a day, alongside the rooms it happens in.
CREATE OR REPLACE VIEW service_day AS
SELECT
  sw.id,
  sw.request_id,
  r.reference_code,
  r.event_name,
  coalesce(cu.name, r.department_org) AS customer_name,
  sw.kind::text,
  sw.starts_at,
  sw.ends_at,
  (sw.starts_at AT TIME ZONE 'America/Chicago')::date AS day,
  (extract(hour from sw.starts_at AT TIME ZONE 'America/Chicago') * 60
   + extract(minute from sw.starts_at AT TIME ZONE 'America/Chicago'))::int
    AS start_minutes,
  (extract(hour from sw.ends_at AT TIME ZONE 'America/Chicago') * 60
   + extract(minute from sw.ends_at AT TIME ZONE 'America/Chicago'))::int
    AS end_minutes,
  sw.staff_count,
  sw.note,
  s.name AS space_name,
  s.building,
  coalesce(r.final_attendance, r.estimated_attendance) AS attendance,
  EXISTS (
    SELECT 1 FROM service_room_conflicts src WHERE src.window_id = sw.id
  ) AS room_conflict
FROM service_windows sw
JOIN event_requests r ON r.id = sw.request_id
LEFT JOIN customers cu ON cu.id = r.customer_id
LEFT JOIN spaces s ON s.id = r.space_id;

-- Events on a day that have no plan yet. The gap worth seeing.
CREATE OR REPLACE VIEW unplanned_events AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  to_char(r.start_time, 'FMHH12:MI AM') AS start_time,
  coalesce(r.final_attendance, r.estimated_attendance) AS attendance,
  s.name AS space_name,
  (SELECT count(*) FROM request_menu_selections sel
    WHERE sel.request_id = r.id) AS menu_lines
FROM event_requests r
LEFT JOIN spaces s ON s.id = r.space_id
WHERE r.status IN ('confirmed', 'pending_final_review')
  AND r.event_date >= CURRENT_DATE
  AND EXISTS (
    SELECT 1 FROM request_menu_selections sel WHERE sel.request_id = r.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM production_tasks t WHERE t.request_id = r.id
  )
ORDER BY r.event_date;
