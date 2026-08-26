-- ============================================================
-- Migration 19 - Cancelling and deleting requests
--
-- Two different acts, deliberately separated.
--
-- Cancelling keeps the record. The event was real, it consumed
-- staff time, and if an external client withdrew, that is lost
-- business the quarterly report should account for.
--
-- Deleting removes it entirely, for requests that should never
-- have existed: test data, duplicates, spam. A test event left in
-- the system quietly corrupts every figure in the reporting views,
-- which is worse than the risk of losing one row.
-- ============================================================

CREATE TYPE cancellation_reason AS ENUM (
  'requester_withdrew',
  'date_changed',
  'duplicate_request',
  'no_longer_needed',
  'funding_withdrawn',
  'weather',
  'other'
);

ALTER TABLE event_requests
  ADD COLUMN cancellation_reason cancellation_reason,
  ADD COLUMN cancellation_note text,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid REFERENCES users(id);

-- What a deleted request was, kept after the request itself is gone.
-- Enough to answer "what happened to EV-26-04821" without keeping the
-- row that would distort reporting.
CREATE TABLE deleted_requests (
  id                bigserial PRIMARY KEY,
  reference_code    text NOT NULL,
  event_name        text NOT NULL,
  event_date        date,
  requester_name    text,
  department_org    text,
  status_at_deletion text,
  classification    text,
  reason            text NOT NULL,
  deleted_by        uuid NOT NULL REFERENCES users(id),
  deleted_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON deleted_requests (deleted_at DESC);

-- A cancellation by an external party is lost business, and gets
-- recorded as such. An internal department changing its mind is not.
CREATE OR REPLACE FUNCTION cancellation_records_lost_business()
RETURNS trigger AS $$
DECLARE
  cls classification;
  charge numeric(10,2);
BEGIN
  IF NEW.cancelled_at IS NULL OR OLD.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cd.classification INTO cls
    FROM classification_decisions cd
   WHERE cd.request_id = NEW.id AND cd.is_current;

  IF cls IS DISTINCT FROM 'external' THEN
    RETURN NEW;
  END IF;

  SELECT sp.estimated_charge INTO charge
    FROM service_paths sp
   WHERE sp.request_id = NEW.id AND sp.is_current;

  INSERT INTO declined_business (
    request_id, event_name, requested_date, classification_expected,
    reason, estimated_revenue_lost, detail, recorded_by
  ) VALUES (
    NEW.id, NEW.event_name, NEW.event_date, cls,
    CASE NEW.cancellation_reason
      WHEN 'requester_withdrew' THEN 'requester_withdrew'::decline_reason
      WHEN 'funding_withdrawn' THEN 'price_not_accepted'::decline_reason
      ELSE 'other'::decline_reason
    END,
    charge, NEW.cancellation_note, NEW.cancelled_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER external_cancellation_is_lost_business
  AFTER UPDATE OF cancelled_at ON event_requests
  FOR EACH ROW EXECUTE FUNCTION cancellation_records_lost_business();

-- Releasing the room is the practical half of a cancellation.
CREATE OR REPLACE FUNCTION cancellation_releases_booking()
RETURNS trigger AS $$
BEGIN
  IF NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL THEN
    UPDATE bookings SET status = 'released', updated_at = now()
     WHERE request_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cancellation_frees_the_room
  AFTER UPDATE OF cancelled_at ON event_requests
  FOR EACH ROW EXECUTE FUNCTION cancellation_releases_booking();
