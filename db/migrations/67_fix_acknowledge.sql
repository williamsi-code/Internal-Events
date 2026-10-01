-- ============================================================
-- Migration 67 - Acknowledge the decision, not the request
--
-- Migration 64 looked for acknowledged_at on event_requests. It
-- lives on classification_decisions, which is the right place: what
-- a requester accepts is a particular decision, and a
-- reclassification should need accepting again.
--
-- Same intent, correct table.
-- ============================================================

CREATE OR REPLACE FUNCTION acknowledge_complete_submission()
RETURNS trigger AS $fn$
DECLARE
  req record;
BEGIN
  IF NOT NEW.is_current THEN RETURN NEW; END IF;

  SELECT id, submitted_complete, status
    INTO req
    FROM event_requests WHERE id = NEW.request_id;

  IF req IS NULL OR NOT req.submitted_complete THEN RETURN NEW; END IF;

  -- The intake quote was at the standard rate, which is the highest
  -- tier there is. Classifying can only move the price down, so
  -- there is nothing here for the requester to protect themselves
  -- from by clicking accept.
  UPDATE classification_decisions
     SET acknowledged_at = now(),
         acknowledged_by = NEW.decided_by
   WHERE id = NEW.id
     AND acknowledged_at IS NULL;

  INSERT INTO request_status_history
    (request_id, from_status, to_status, changed_by, reason)
  VALUES
    (NEW.request_id, req.status, req.status, NEW.decided_by,
     'Accepted automatically: everything was given at intake and the quoted price can only fall');

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;
