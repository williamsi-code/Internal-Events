-- ============================================================
-- Migration 16 - Capacity check outcomes
--
-- The check itself already exists from migration 01. What was
-- missing is the outcome: proceed, offer an alternative, or
-- decline. The third branch is the one that matters most for
-- reporting, because declined business only exists as data if
-- someone records what was turned away and what it was worth.
-- ============================================================

CREATE TYPE capacity_outcome AS ENUM (
  'proceed',
  'alternative_offered',
  'declined'
);

ALTER TABLE capacity_checks
  ADD COLUMN outcome capacity_outcome,
  ADD COLUMN proposed_date date,
  ADD COLUMN proposed_space_id uuid REFERENCES spaces(id),
  ADD COLUMN proposed_detail text,
  ADD COLUMN decline_reason decline_reason,
  ADD COLUMN estimated_revenue_lost numeric(10,2)
    CHECK (estimated_revenue_lost >= 0),
  ADD COLUMN outside_caterer_referred boolean NOT NULL DEFAULT false;

-- A decline recorded here becomes a row in declined_business, so
-- Section H of the leadership report is a consequence of doing the
-- work rather than a separate task someone has to remember.
CREATE OR REPLACE FUNCTION record_declined_business()
RETURNS trigger AS $$
BEGIN
  IF NEW.outcome <> 'declined' THEN
    RETURN NEW;
  END IF;

  INSERT INTO declined_business (
    request_id, event_name, requested_date, classification_expected,
    reason, estimated_revenue_lost, outside_caterer_used, detail, recorded_by
  )
  SELECT r.id, r.event_name, r.event_date, cd.classification,
         coalesce(NEW.decline_reason, 'other'),
         NEW.estimated_revenue_lost,
         NEW.outside_caterer_referred,
         NEW.concerns,
         NEW.checked_by
    FROM event_requests r
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
   WHERE r.id = NEW.request_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capacity_decline_records_lost_business
  AFTER INSERT ON capacity_checks
  FOR EACH ROW EXECUTE FUNCTION record_declined_business();

-- An accepted alternative is a near miss: the event went ahead, but
-- not as asked for. Tracking these shows strain a quarter or two
-- before it turns into lost revenue.
CREATE OR REPLACE FUNCTION record_capacity_modification()
RETURNS trigger AS $$
BEGIN
  IF NEW.outcome <> 'alternative_offered' THEN
    RETURN NEW;
  END IF;

  INSERT INTO capacity_modifications (request_id, reason, what_changed, recorded_by)
  VALUES (
    NEW.request_id,
    coalesce(NEW.decline_reason, 'other'),
    coalesce(NEW.proposed_detail, NEW.alternatives_offered, 'Alternative offered'),
    NEW.checked_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capacity_alternative_records_modification
  AFTER INSERT ON capacity_checks
  FOR EACH ROW EXECUTE FUNCTION record_capacity_modification();

CREATE INDEX ON capacity_checks (request_id, checked_at DESC);

-- What else is happening on a given day, for the staffing judgement.
-- Kitchen capacity is not a property of one event; it is a property
-- of everything running at once.
CREATE VIEW daily_load AS
SELECT
  (b.starts_at AT TIME ZONE 'America/Chicago')::date AS day,
  count(*) FILTER (WHERE b.status = 'confirmed')      AS confirmed_events,
  count(*) FILTER (WHERE b.status = 'tentative')      AS tentative_events,
  sum(coalesce(r.final_attendance, r.estimated_attendance))
    FILTER (WHERE b.status = 'confirmed')             AS confirmed_guests,
  sum(coalesce(r.final_attendance, r.estimated_attendance))
    FILTER (WHERE b.status = 'tentative')             AS tentative_guests
FROM bookings b
LEFT JOIN event_requests r ON r.id = b.request_id
WHERE b.status <> 'released' AND NOT b.is_blackout
GROUP BY 1;
