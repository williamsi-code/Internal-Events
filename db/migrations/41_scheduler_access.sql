-- ============================================================
-- Migration 41 - Schedule viewers, recurring bookings, and
--                taking a space out of service
--
-- Three things that arrived together because they all touch the
-- scheduler.
--
-- 1. Security and facilities need to know what is happening in the
--    buildings. They do not need the queue, the menu, or anyone's
--    budget account. A role that grants the schedule and nothing
--    else is safer than handing out events_staff.
--
-- 2. A weekly meeting booked one date at a time is thirty pieces of
--    data entry and thirty chances to miss one.
--
-- 3. A room being refinished is not the same as a room that does
--    not exist. Deactivating it loses its history; leaving it
--    bookable causes an event nobody can hold.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Read-only schedule access
--
-- Added as a value only. Postgres will not let a new enum value be
-- used in the same transaction that creates it, so nothing here
-- references it - the application grants it later.
-- ------------------------------------------------------------

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'schedule_viewer';

-- ------------------------------------------------------------
-- 2. Recurring bookings
--
-- Occurrences are generated as real rows rather than computed on
-- the fly. That means the overlap constraint, the conflict view and
-- the resource grid all work without knowing recurrence exists, and
-- a single occurrence can be moved or cancelled without breaking
-- the pattern.
-- ------------------------------------------------------------

CREATE TYPE recurrence_kind AS ENUM ('weekly', 'fortnightly', 'monthly_date', 'monthly_weekday');

CREATE TABLE booking_series (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  request_id    uuid REFERENCES event_requests(id) ON DELETE CASCADE,

  title         text NOT NULL,
  note          text,

  kind          recurrence_kind NOT NULL,
  -- Which days, for weekly and fortnightly. 0 is Sunday.
  weekdays      integer[] NOT NULL DEFAULT '{}',
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,

  setup_minutes    integer NOT NULL DEFAULT 0,
  teardown_minutes integer NOT NULL DEFAULT 0,
  status        booking_status NOT NULL DEFAULT 'tentative',

  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_on >= starts_on),
  CHECK (end_time > start_time)
);

CREATE INDEX ON booking_series (space_id);

ALTER TABLE bookings
  ADD COLUMN series_id uuid REFERENCES booking_series(id) ON DELETE CASCADE,
  ADD COLUMN series_index integer;

CREATE INDEX ON bookings (series_id);

-- A booking from a series stands on its own, like an import does.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_has_an_origin;
ALTER TABLE bookings
  ADD CONSTRAINT booking_has_an_origin CHECK (
    request_id IS NOT NULL
    OR is_blackout
    OR import_batch_id IS NOT NULL
    OR series_id IS NOT NULL
  );

-- Work out the dates a pattern covers. Kept in SQL so the preview
-- and the commit cannot disagree about which dates are included.
CREATE OR REPLACE FUNCTION series_dates(
  p_kind recurrence_kind,
  p_weekdays integer[],
  p_from date,
  p_to date
) RETURNS SETOF date AS $$
  SELECT d::date
    FROM generate_series(p_from, p_to, interval '1 day') d
   WHERE CASE p_kind
           WHEN 'weekly' THEN
             extract(dow FROM d)::int = ANY(p_weekdays)
           WHEN 'fortnightly' THEN
             extract(dow FROM d)::int = ANY(p_weekdays)
             AND (floor((d::date - p_from) / 7)::int % 2) = 0
           WHEN 'monthly_date' THEN
             extract(day FROM d) = extract(day FROM p_from)
           WHEN 'monthly_weekday' THEN
             extract(dow FROM d) = extract(dow FROM p_from)
             AND ceil(extract(day FROM d) / 7.0)
                 = ceil(extract(day FROM p_from) / 7.0)
         END;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- 3. Taking a space out of service
-- ------------------------------------------------------------

CREATE TYPE closure_kind AS ENUM (
  'maintenance',
  'renovation',
  'seasonal',
  'reserved',
  'other'
);

CREATE TABLE space_closures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  kind        closure_kind NOT NULL DEFAULT 'maintenance',
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  reason      text NOT NULL,
  -- A hold warns; a closure refuses. The difference matters: a room
  -- pencilled out for a possible renovation should not silently
  -- reject a booking someone needs to make.
  blocks_booking boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_on >= starts_on)
);

CREATE INDEX ON space_closures (space_id, starts_on, ends_on);

-- Closures appear on the scheduler as blackout bookings, so a room
-- out of service looks occupied rather than mysteriously empty.
CREATE OR REPLACE FUNCTION closure_creates_blackout()
RETURNS trigger AS $$
BEGIN
  DELETE FROM bookings
   WHERE is_blackout
     AND space_id = NEW.space_id
     AND external_ref = 'closure:' || NEW.id::text;

  INSERT INTO bookings (
    space_id, starts_at, ends_at, event_starts_at, event_ends_at,
    status, title, note, is_blackout, setup_minutes, teardown_minutes,
    external_ref, created_by
  ) VALUES (
    NEW.space_id,
    (NEW.starts_on + TIME '00:00') AT TIME ZONE 'America/Chicago',
    (NEW.ends_on + INTERVAL '1 day') AT TIME ZONE 'America/Chicago',
    (NEW.starts_on + TIME '00:00') AT TIME ZONE 'America/Chicago',
    (NEW.ends_on + INTERVAL '1 day') AT TIME ZONE 'America/Chicago',
    'tentative',
    CASE NEW.kind
      WHEN 'maintenance' THEN 'Maintenance'
      WHEN 'renovation'  THEN 'Renovation'
      WHEN 'seasonal'    THEN 'Closed for the season'
      WHEN 'reserved'    THEN 'Held'
      ELSE 'Out of service'
    END,
    NEW.reason, true, 0, 0,
    'closure:' || NEW.id::text,
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER closure_blocks_the_room
  AFTER INSERT OR UPDATE ON space_closures
  FOR EACH ROW EXECUTE FUNCTION closure_creates_blackout();

CREATE OR REPLACE FUNCTION closure_removed_frees_room()
RETURNS trigger AS $$
BEGIN
  DELETE FROM bookings
   WHERE is_blackout AND external_ref = 'closure:' || OLD.id::text;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER closure_removal_frees_room
  AFTER DELETE ON space_closures
  FOR EACH ROW EXECUTE FUNCTION closure_removed_frees_room();

-- Is a room usable on a given date?
CREATE OR REPLACE FUNCTION space_closed_on(p_space uuid, p_date date)
RETURNS TABLE (reason text, blocks boolean) AS $$
  SELECT c.reason, c.blocks_booking
    FROM space_closures c
   WHERE c.space_id = p_space
     AND p_date BETWEEN c.starts_on AND c.ends_on
   ORDER BY c.blocks_booking DESC
   LIMIT 1;
$$ LANGUAGE sql STABLE;

-- What is currently out of service, for the back office.
CREATE VIEW spaces_out_of_service AS
SELECT
  c.id,
  c.space_id,
  s.name AS space_name,
  s.building,
  c.kind,
  c.starts_on,
  c.ends_on,
  c.reason,
  c.blocks_booking,
  (CURRENT_DATE BETWEEN c.starts_on AND c.ends_on) AS active_now,
  (SELECT count(*) FROM bookings b
    WHERE b.space_id = c.space_id
      AND NOT b.is_blackout
      AND b.status <> 'released'
      AND (b.starts_at AT TIME ZONE 'America/Chicago')::date
          BETWEEN c.starts_on AND c.ends_on) AS events_affected
FROM space_closures c
JOIN spaces s ON s.id = c.space_id
WHERE c.ends_on >= CURRENT_DATE
ORDER BY c.starts_on;
