-- ============================================================
-- Migration 72 - The catering calendar
--
-- The kitchen grid shows prep against stations, which is what a
-- chef needs on the morning. It is not what anyone needs when asked
-- "what are we catering next Thursday" - that question wants rooms
-- and times, the same shape as the room scheduler, filtered to the
-- events with food.
--
-- Two views of the same day, then. This provides the first.
-- ============================================================

CREATE OR REPLACE VIEW catered_bookings AS
SELECT
  b.id,
  b.request_id,
  r.reference_code,
  coalesce(b.title, r.event_name) AS title,
  r.event_name,
  coalesce(cu.name, r.department_org) AS customer_name,
  b.space_id,
  s.name AS space_name,
  s.building,
  s.category AS space_category,
  b.starts_at,
  b.ends_at,
  b.event_starts_at,
  b.event_ends_at,
  b.status::text,
  cd.classification::text,
  coalesce(r.final_attendance, r.estimated_attendance) AS attendance,

  -- Who is cooking. An event with an outside caterer still belongs
  -- on this calendar: the room, the setup and the timing are ours
  -- even when the food is not.
  (SELECT string_agg(fs.kind::text, ',' ORDER BY fs.kind)
     FROM event_food_sources fs
    WHERE fs.request_id = r.id) AS food_kinds,

  EXISTS (
    SELECT 1 FROM event_food_sources fs
     WHERE fs.request_id = r.id AND fs.kind = 'central_dining'
  ) AS central_cooking,

  (SELECT count(*)::int FROM request_menu_selections sel
    WHERE sel.request_id = r.id) AS menu_lines,

  (SELECT count(*)::int FROM production_tasks t
    WHERE t.request_id = r.id AND t.state <> 'cancelled') AS tasks,

  (SELECT count(*)::int FROM production_tasks t
    WHERE t.request_id = r.id AND t.state = 'done') AS tasks_done,

  r.event_date
FROM bookings b
JOIN event_requests r ON r.id = b.request_id
JOIN spaces s ON s.id = b.space_id
LEFT JOIN customers cu ON cu.id = r.customer_id
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
WHERE b.status <> 'released'
  AND NOT b.is_blackout
  AND EXISTS (
    SELECT 1 FROM event_food_sources fs
     WHERE fs.request_id = r.id
       AND fs.kind <> 'no_food'
  );

COMMENT ON VIEW catered_bookings IS
  'Events with food, in the shape the room scheduler uses. Includes events catered by someone else, since the room and the timing are still ours.';

-- Only the rooms with catering in them on a given day, so the grid
-- is not forty empty rows.
CREATE OR REPLACE FUNCTION catered_spaces_between(
  p_from date,
  p_to date
) RETURNS TABLE (
  id uuid,
  name text,
  building text,
  category text,
  capacity_seated integer,
  sort_order integer,
  events integer
) AS $fn$
  SELECT s.id, s.name, s.building, s.category, s.capacity_seated,
         s.sort_order,
         count(cb.id)::int
    FROM spaces s
    JOIN catered_bookings cb ON cb.space_id = s.id
   WHERE cb.event_date BETWEEN p_from AND p_to
   GROUP BY s.id, s.name, s.building, s.category,
            s.capacity_seated, s.sort_order
   ORDER BY s.sort_order, s.name;
$fn$ LANGUAGE sql STABLE;
