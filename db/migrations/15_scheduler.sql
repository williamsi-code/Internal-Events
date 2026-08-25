-- ============================================================
-- Migration 15 - Room scheduler
--
-- Scoped to catering and events, not all campus room booking.
-- Resource Scheduler remains the institutional source of truth
-- for everything else; this owns event holds and confirmations
-- and leaves a clean seam for a future sync.
--
-- A booking is separate from its request because the room is
-- occupied longer than the event runs: setup before, teardown
-- after. Those buffers are what actually collide.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE booking_status AS ENUM ('tentative', 'confirmed', 'released');

CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid REFERENCES event_requests(id) ON DELETE CASCADE,
  space_id      uuid NOT NULL REFERENCES spaces(id),

  -- What the room is actually occupied for, buffers included.
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,

  -- The event itself, for display. Kept separate so staff can see
  -- "doors at 6" while the room is held from 4.
  event_starts_at timestamptz,
  event_ends_at   timestamptz,

  setup_minutes    integer NOT NULL DEFAULT 60 CHECK (setup_minutes >= 0),
  teardown_minutes integer NOT NULL DEFAULT 60 CHECK (teardown_minutes >= 0),

  status        booking_status NOT NULL DEFAULT 'tentative',
  title         text NOT NULL,
  note          text,

  -- Blocks not tied to a request: maintenance, holidays, holds.
  is_blackout   boolean NOT NULL DEFAULT false,

  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at),
  CHECK (request_id IS NOT NULL OR is_blackout)
);

CREATE INDEX ON bookings (space_id, starts_at);
CREATE INDEX ON bookings (starts_at);
CREATE INDEX ON bookings (request_id);
CREATE INDEX ON bookings (status) WHERE status <> 'released';

-- Two confirmed bookings cannot occupy the same space at the same
-- time. Enforced in the database rather than the application, because
-- a double-booked ballroom is the one mistake that cannot be undone
-- on the day.
--
-- Tentative bookings are deliberately excluded: holds overlap all the
-- time while dates are being negotiated, and blocking that would push
-- staff back into a spreadsheet.
ALTER TABLE bookings
  ADD CONSTRAINT no_confirmed_overlap
  EXCLUDE USING gist (
    space_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'confirmed');

-- ------------------------------------------------------------
-- Keeping bookings in step with their request
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_booking_from_request()
RETURNS trigger AS $$
DECLARE
  b_start   timestamptz;
  b_end     timestamptz;
  ev_start  timestamptz;
  ev_end    timestamptz;
  acknowledged boolean;
  want_status booking_status;
BEGIN
  IF NEW.space_id IS NULL OR NEW.event_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Times are optional on intake, so fall back to a working day.
  ev_start := (NEW.event_date + coalesce(NEW.start_time, TIME '08:00'))
                AT TIME ZONE 'America/Chicago';
  ev_end   := (NEW.event_date + coalesce(NEW.end_time, TIME '17:00'))
                AT TIME ZONE 'America/Chicago';

  IF ev_end <= ev_start THEN
    ev_end := ev_start + INTERVAL '1 hour';
  END IF;

  SELECT cd.acknowledged_at IS NOT NULL INTO acknowledged
    FROM classification_decisions cd
   WHERE cd.request_id = NEW.id AND cd.is_current;

  want_status := CASE
    WHEN NEW.status IN ('cancelled', 'denied') THEN 'released'
    WHEN NEW.status = 'confirmed' THEN 'confirmed'
    WHEN coalesce(acknowledged, false) THEN 'tentative'
    ELSE NULL
  END;

  IF want_status IS NULL THEN
    RETURN NEW;
  END IF;

  b_start := ev_start - INTERVAL '60 minutes';
  b_end   := ev_end + INTERVAL '60 minutes';

  INSERT INTO bookings (
    request_id, space_id, starts_at, ends_at,
    event_starts_at, event_ends_at, status, title
  )
  VALUES (
    NEW.id, NEW.space_id, b_start, b_end,
    ev_start, ev_end, want_status, NEW.event_name
  )
  ON CONFLICT (request_id) WHERE request_id IS NOT NULL
  DO UPDATE SET
    space_id        = EXCLUDED.space_id,
    starts_at       = EXCLUDED.starts_at,
    ends_at         = EXCLUDED.ends_at,
    event_starts_at = EXCLUDED.event_starts_at,
    event_ends_at   = EXCLUDED.event_ends_at,
    status          = EXCLUDED.status,
    title           = EXCLUDED.title,
    updated_at      = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- One booking per request.
CREATE UNIQUE INDEX one_booking_per_request
  ON bookings (request_id) WHERE request_id IS NOT NULL;

CREATE TRIGGER booking_follows_request
  AFTER INSERT OR UPDATE OF status, event_date, start_time, end_time,
                            space_id, event_name
  ON event_requests
  FOR EACH ROW EXECUTE FUNCTION sync_booking_from_request();

-- Acknowledging a classification is what puts an event tentatively on
-- the schedule, so that has to fire the sync too.
CREATE OR REPLACE FUNCTION booking_on_acknowledgement()
RETURNS trigger AS $$
BEGIN
  IF NEW.acknowledged_at IS NOT NULL AND OLD.acknowledged_at IS NULL THEN
    UPDATE event_requests SET updated_at = now() WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_on_ack
  AFTER UPDATE OF acknowledged_at ON classification_decisions
  FOR EACH ROW EXECUTE FUNCTION booking_on_acknowledgement();

CREATE TRIGGER request_touch_syncs_booking
  AFTER UPDATE OF updated_at ON event_requests
  FOR EACH ROW EXECUTE FUNCTION sync_booking_from_request();

-- ------------------------------------------------------------
-- Conflicts
--
-- The constraint above prevents confirmed collisions outright. This
-- surfaces the ones staff still need to resolve: tentative holds
-- sitting on top of each other, or on top of a confirmed booking.
-- ------------------------------------------------------------

CREATE VIEW booking_conflicts AS
SELECT
  a.id            AS booking_id,
  a.request_id,
  a.title,
  a.status,
  a.starts_at,
  a.ends_at,
  s.name          AS space_name,
  s.building,
  b.id            AS other_booking_id,
  b.request_id    AS other_request_id,
  b.title         AS other_title,
  b.status        AS other_status
FROM bookings a
JOIN bookings b
  ON a.space_id = b.space_id
 AND a.id <> b.id
 AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
JOIN spaces s ON s.id = a.space_id
WHERE a.status <> 'released'
  AND b.status <> 'released'
  AND a.ends_at > now();

-- Backfill from requests already past the acknowledgement point.
UPDATE event_requests SET updated_at = now()
 WHERE space_id IS NOT NULL
   AND status IN ('classified','details_pending','pending_final_review','confirmed');
