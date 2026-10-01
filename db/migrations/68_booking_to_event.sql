-- ============================================================
-- Migration 68 - A room booking can become an event
--
-- Clicking a free slot books the room, which is what most people
-- want. Some of them later decide they want food, and until now
-- that meant starting again: a new request, a new room booking, and
-- the original either cancelled or left to double-book itself.
--
-- So a room booking can grow into an event. The booking is reused
-- rather than replaced, which matters: the room never blinks out of
-- the schedule, and anyone looking at that slot sees it held
-- throughout.
-- ============================================================

-- Bookings that could become events: no request behind them, not a
-- blackout, not in the past.
CREATE OR REPLACE VIEW bookings_without_events AS
SELECT
  b.id AS booking_id,
  b.title,
  b.quick_purpose,
  b.quick_attendance,
  b.space_id,
  s.name AS space_name,
  s.building,
  s.supports_catering,
  (b.event_starts_at AT TIME ZONE 'America/Chicago')::date AS event_date,
  (b.event_starts_at AT TIME ZONE 'America/Chicago')::time AS start_time,
  (b.event_ends_at AT TIME ZONE 'America/Chicago')::time AS end_time,
  b.status::text,
  b.is_quick_booking,
  b.requested_by,
  u.full_name AS requested_by_name,
  u.email::text AS requested_by_email,
  u.department_org
FROM bookings b
JOIN spaces s ON s.id = b.space_id
LEFT JOIN users u ON u.id = b.requested_by
WHERE b.request_id IS NULL
  AND NOT b.is_blackout
  AND b.status <> 'released'
  AND b.event_ends_at > now();

-- Turn one into an event request, keeping the booking.
--
-- The classification answers are left empty on purpose: staff
-- classify from the description like any other request, and nobody
-- has been asked anything yet.
CREATE OR REPLACE FUNCTION room_booking_to_event(
  p_booking_id uuid,
  p_user uuid,
  p_event_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_attendance integer DEFAULT NULL
) RETURNS uuid AS $fn$
DECLARE
  bk record;
  owner uuid;
  owner_name text;
  owner_email citext;
  owner_org text;
  new_id uuid;
BEGIN
  SELECT * INTO bk FROM bookings_without_events
   WHERE booking_id = p_booking_id;

  IF bk IS NULL THEN
    RAISE EXCEPTION 'That booking cannot become an event';
  END IF;

  -- The person who asked for the room owns the event. Where staff
  -- booked it themselves, it falls to whoever is converting.
  owner := coalesce(bk.requested_by, p_user);

  SELECT full_name, email, department_org
    INTO owner_name, owner_email, owner_org
    FROM users WHERE id = owner;

  INSERT INTO event_requests (
    requester_id, requester_name, department_org, contact_email,
    event_name, event_description, event_date, start_time, end_time,
    space_id, estimated_attendance,
    status, submitted_at, converted_from_booking_id, entered_by_staff
  ) VALUES (
    owner,
    coalesce(owner_name, 'Unknown'),
    coalesce(owner_org, 'Not given'),
    owner_email,
    coalesce(p_event_name, bk.title),
    coalesce(p_description, bk.quick_purpose),
    bk.event_date, bk.start_time, bk.end_time,
    bk.space_id,
    coalesce(p_attendance, bk.quick_attendance, 1),
    'submitted', now(), p_booking_id, (owner <> p_user)
  ) RETURNING id INTO new_id;

  -- The booking is reused rather than replaced, so the room never
  -- blinks out of the schedule.
  UPDATE bookings
     SET request_id = new_id,
         is_quick_booking = false,
         quick_state = NULL,
         title = coalesce(p_event_name, title)
   WHERE id = p_booking_id;

  -- Food is the reason for converting, so it is assumed and can be
  -- changed.
  INSERT INTO event_food_sources (request_id, kind)
  VALUES (new_id, 'central_dining');

  INSERT INTO event_requirements (request_id) VALUES (new_id);

  INSERT INTO event_funding (request_id, financial_risk_bearer)
  VALUES (new_id, 'unclear');

  INSERT INTO classification_answers (request_id, requester_notes)
  VALUES (new_id, coalesce(p_description, bk.quick_purpose));

  INSERT INTO request_status_history
    (request_id, from_status, to_status, changed_by, reason)
  VALUES
    (new_id, 'draft', 'submitted', p_user,
     'Grew out of a room booking');

  RETURN new_id;
END;
$fn$ LANGUAGE plpgsql;

COMMENT ON FUNCTION room_booking_to_event IS
  'Turn a room-only booking into a catered event, keeping the same booking so the room is never released.';
