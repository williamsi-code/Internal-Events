-- ============================================================
-- Migration 73 - A request holds its room from the start
--
-- Until now a room was not held until an event was confirmed, which
-- meant two people could ask for the Vermeer on the same Saturday
-- and neither would know until somebody noticed.
--
-- So a request takes a tentative hold the moment it is submitted,
-- and it becomes solid once the classification is accepted.
--
-- The sharp edge: a room already held by another request cannot be
-- held twice. Rather than refusing the request - which would be
-- rude and would lose the rest of what they typed - the request is
-- taken without a booking and flagged, and the capacity check is
-- where somebody sorts it out. That is what the capacity check is
-- for.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN room_unavailable boolean NOT NULL DEFAULT false,
  ADD COLUMN room_clash_with uuid REFERENCES bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN event_requests.room_unavailable IS
  'The room was already held when this was submitted. No booking was made; the capacity check decides what happens.';

CREATE OR REPLACE FUNCTION hold_room_on_submit()
RETURNS trigger AS $fn$
DECLARE
  clash uuid;
  setup_minutes integer := 60;
  teardown_minutes integer := 60;
  starts timestamptz;
  ends timestamptz;
BEGIN
  IF NEW.space_id IS NULL OR NEW.start_time IS NULL THEN
    RETURN NEW;
  END IF;

  -- A short-notice request waits for someone to say yes before it
  -- takes a room off anyone.
  IF NEW.short_notice AND NEW.short_notice_state = 'pending' THEN
    RETURN NEW;
  END IF;

  starts := (NEW.event_date + NEW.start_time) AT TIME ZONE 'America/Chicago'
            - (setup_minutes || ' minutes')::interval;
  ends := (NEW.event_date
           + coalesce(NEW.end_time, NEW.start_time + INTERVAL '2 hours'))
          AT TIME ZONE 'America/Chicago'
          + (teardown_minutes || ' minutes')::interval;

  SELECT b.id INTO clash
    FROM bookings b
   WHERE b.space_id = NEW.space_id
     AND b.status <> 'released'
     AND tstzrange(b.starts_at, b.ends_at) && tstzrange(starts, ends)
   LIMIT 1;

  IF clash IS NOT NULL THEN
    UPDATE event_requests
       SET room_unavailable = true, room_clash_with = clash
     WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO bookings (
    space_id, request_id, starts_at, ends_at,
    event_starts_at, event_ends_at,
    status, title, setup_minutes, teardown_minutes, created_by
  ) VALUES (
    NEW.space_id, NEW.id, starts, ends,
    (NEW.event_date + NEW.start_time) AT TIME ZONE 'America/Chicago',
    (NEW.event_date
     + coalesce(NEW.end_time, NEW.start_time + INTERVAL '2 hours'))
      AT TIME ZONE 'America/Chicago',
    'tentative', NEW.event_name,
    setup_minutes, teardown_minutes, NEW.requester_id
  );

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hold_room_on_submit ON event_requests;
CREATE TRIGGER hold_room_on_submit
  AFTER INSERT ON event_requests
  FOR EACH ROW
  WHEN (NEW.status = 'submitted')
  EXECUTE FUNCTION hold_room_on_submit();

-- ------------------------------------------------------------
-- Tentative becomes confirmed once the classification is accepted
--
-- That is the moment the requester has agreed to what it costs, so
-- it is the moment the room stops being provisional.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION confirm_room_on_acknowledge()
RETURNS trigger AS $fn$
BEGIN
  IF NEW.acknowledged_at IS NULL THEN RETURN NEW; END IF;
  IF OLD.acknowledged_at IS NOT NULL THEN RETURN NEW; END IF;

  UPDATE bookings
     SET status = 'confirmed'
   WHERE request_id = NEW.request_id
     AND status = 'tentative';

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS confirm_room_on_acknowledge ON classification_decisions;
CREATE TRIGGER confirm_room_on_acknowledge
  AFTER UPDATE ON classification_decisions
  FOR EACH ROW
  EXECUTE FUNCTION confirm_room_on_acknowledge();

-- The same for a decision that arrives already acknowledged, which
-- is what happens to a complete submission from a department.
CREATE OR REPLACE FUNCTION confirm_room_on_insert()
RETURNS trigger AS $fn$
BEGIN
  IF NEW.acknowledged_at IS NULL THEN RETURN NEW; END IF;

  UPDATE bookings
     SET status = 'confirmed'
   WHERE request_id = NEW.request_id
     AND status = 'tentative';

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS confirm_room_on_insert ON classification_decisions;
CREATE TRIGGER confirm_room_on_insert
  AFTER INSERT ON classification_decisions
  FOR EACH ROW
  EXECUTE FUNCTION confirm_room_on_insert();

-- A cancelled or refused request lets the room go.
CREATE OR REPLACE FUNCTION release_room_on_close()
RETURNS trigger AS $fn$
BEGIN
  IF NEW.status IN ('cancelled', 'denied')
     AND OLD.status NOT IN ('cancelled', 'denied') THEN
    UPDATE bookings
       SET status = 'released'
     WHERE request_id = NEW.id
       AND status <> 'released'
       -- Unless somebody deliberately kept the room after a decline.
       AND NOT NEW.keeps_room_after_decline;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS release_room_on_close ON event_requests;
CREATE TRIGGER release_room_on_close
  AFTER UPDATE OF status ON event_requests
  FOR EACH ROW
  EXECUTE FUNCTION release_room_on_close();

-- Requests whose room was gone when they arrived. The first thing
-- the office should deal with, because the requester does not know.
CREATE OR REPLACE VIEW room_clashes AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  to_char(r.start_time, 'FMHH12:MI AM') AS start_time,
  r.requester_name,
  r.department_org,
  s.name AS space_name,
  other.title AS clashes_with,
  other_r.id AS clashes_with_request,
  to_char(other.event_starts_at AT TIME ZONE 'America/Chicago',
          'FMHH12:MI AM') AS clash_from,
  to_char(other.event_ends_at AT TIME ZONE 'America/Chicago',
          'FMHH12:MI AM') AS clash_until
FROM event_requests r
LEFT JOIN spaces s ON s.id = r.space_id
LEFT JOIN bookings other ON other.id = r.room_clash_with
LEFT JOIN event_requests other_r ON other_r.id = other.request_id
WHERE r.room_unavailable
  AND r.status NOT IN ('cancelled', 'denied', 'completed')
  AND r.event_date >= CURRENT_DATE
ORDER BY r.event_date;
