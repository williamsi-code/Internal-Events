-- ============================================================
-- Migration 60 - Booking a meeting room in one step
--
-- Most room bookings are not events. A committee wants the Sutphen
-- Room for an hour on Thursday: no food, no setup, no
-- classification. Putting that through a four-section intake form is
-- why people book rooms by email instead, and email bookings are
-- invisible to everyone else.
--
-- So: click the room on the day you want, fill in four fields, done.
-- It creates a booking and nothing else - no event request, no menu
-- step, no close-out. Anything involving food goes through intake,
-- and the form says so.
-- ============================================================

CREATE TYPE quick_booking_state AS ENUM ('requested', 'confirmed', 'refused');

ALTER TABLE bookings
  ADD COLUMN is_quick_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN requested_by uuid REFERENCES users(id),
  ADD COLUMN quick_state quick_booking_state,
  ADD COLUMN quick_purpose text,
  ADD COLUMN quick_attendance integer,
  ADD COLUMN decided_by uuid REFERENCES users(id),
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN decision_note text;

-- A quick booking stands on its own, like an import or a series.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_has_an_origin;
ALTER TABLE bookings
  ADD CONSTRAINT booking_has_an_origin CHECK (
    request_id IS NOT NULL
    OR is_blackout
    OR import_batch_id IS NOT NULL
    OR series_id IS NOT NULL
    OR is_quick_booking
  );

CREATE INDEX ON bookings (quick_state) WHERE is_quick_booking;

-- ------------------------------------------------------------
-- Can this room be taken, then?
--
-- One function rather than four checks in the route, so the form's
-- preview and the actual booking cannot disagree about whether a
-- slot is free.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION quick_booking_check(
  p_space_id uuid,
  p_date date,
  p_start time,
  p_end time
) RETURNS TABLE (
  ok boolean,
  problem text,
  clash_title text,
  closure_reason text,
  notice_hours numeric,
  space_name text,
  supports_catering boolean
) AS $fn$
DECLARE
  s record;
  clash_title_found text;
  closed record;
  hours numeric;
BEGIN
  SELECT sp.name, sp.supports_catering, sp.minimum_notice_hours
    INTO s
    FROM spaces sp WHERE sp.id = p_space_id AND sp.is_active;

  IF s IS NULL THEN
    RETURN QUERY SELECT false, 'That room is not bookable.'::text,
      NULL::text, NULL::text, NULL::numeric, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  IF p_end <= p_start THEN
    RETURN QUERY SELECT false, 'The end time must be after the start.'::text,
      NULL::text, NULL::text, NULL::numeric, s.name, s.supports_catering;
    RETURN;
  END IF;

  hours := EXTRACT(epoch FROM (
    (p_date + p_start) AT TIME ZONE 'America/Chicago'
  ) - now()) / 3600.0;

  -- A room out of service refuses outright where the closure blocks;
  -- a hold only warns, and the booking goes through.
  SELECT reason, blocks INTO closed
    FROM space_closed_on(p_space_id, p_date);

  IF coalesce(closed.blocks, false) THEN
    RETURN QUERY SELECT false,
      'That room is out of service on the day.'::text,
      NULL::text, closed.reason, round(hours, 1),
      s.name, s.supports_catering;
    RETURN;
  END IF;

  SELECT b.title INTO clash_title_found
    FROM bookings b
   WHERE b.space_id = p_space_id
     AND b.status <> 'released'
     AND tstzrange(b.starts_at, b.ends_at) && tstzrange(
           (p_date + p_start) AT TIME ZONE 'America/Chicago',
           (p_date + p_end) AT TIME ZONE 'America/Chicago')
   LIMIT 1;

  IF clash_title_found IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Something else is in that room then.'::text,
      clash_title_found, closed.reason, round(hours, 1),
      s.name, s.supports_catering;
    RETURN;
  END IF;

  IF hours < 0 THEN
    RETURN QUERY SELECT false, 'That time has already passed.'::text,
      NULL::text, closed.reason, round(hours, 1),
      s.name, s.supports_catering;
    RETURN;
  END IF;

  -- Short notice does not refuse a room-only booking. Nothing has to
  -- be ordered or cooked, so the only question is whether the room is
  -- free, and it is.
  RETURN QUERY SELECT true, NULL::text,
    NULL::text, closed.reason, round(hours, 1),
    s.name, s.supports_catering;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- Quick bookings waiting on someone, for the staff queue.
CREATE OR REPLACE VIEW quick_bookings_waiting AS
SELECT
  b.id,
  b.title,
  b.quick_purpose,
  b.quick_attendance,
  s.name AS space_name,
  s.building,
  (b.event_starts_at AT TIME ZONE 'America/Chicago')::date AS event_date,
  to_char(b.event_starts_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
    AS start_time,
  to_char(b.event_ends_at AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
    AS end_time,
  u.full_name AS requested_by_name,
  u.email::text AS requested_by_email,
  u.department_org,
  b.created_at
FROM bookings b
JOIN spaces s ON s.id = b.space_id
LEFT JOIN users u ON u.id = b.requested_by
WHERE b.is_quick_booking
  AND b.quick_state = 'requested'
  AND b.status <> 'released'
ORDER BY b.event_starts_at;
