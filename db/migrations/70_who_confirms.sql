-- ============================================================
-- Migration 70 - Who still has to confirm
--
-- Migration 64 stopped asking anyone who gave everything at intake
-- to confirm again, on the grounds that the quote was at the
-- standard rate and could only fall.
--
-- That is right for a department, whose price drops and who is
-- paying from a budget account either way. It is not right for an
-- outside customer, where the quote is the price, real money is
-- about to change hands, and a confirmation is the nearest thing to
-- a signature we have.
--
-- So: internal and affiliated events are accepted for them, and
-- external ones get one screen to agree to.
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

  -- An outside customer confirms for themselves. Their quote does
  -- not fall, and a confirmation is the nearest thing to a signature
  -- this system has.
  IF NEW.classification IN ('external', 'needs_management_review') THEN
    RETURN NEW;
  END IF;

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

-- What a requester is being asked to agree to, where they are.
CREATE OR REPLACE FUNCTION confirmation_needed(p_request_id uuid)
RETURNS TABLE (
  needs_confirming boolean,
  reason text,
  quoted numeric,
  classification text
) AS $fn$
  SELECT
    cd.acknowledged_at IS NULL,
    CASE
      WHEN cd.acknowledged_at IS NOT NULL THEN 'Already agreed'
      WHEN NOT r.submitted_complete THEN 'Still choosing'
      WHEN cd.classification = 'external'
        THEN 'An outside event: the quote is the price, so we ask them to agree to it'
      WHEN cd.classification = 'needs_management_review'
        THEN 'Needs reviewing before anyone agrees to anything'
      ELSE 'Accepted for them'
    END,
    quoted_total(r.id),
    cd.classification::text
  FROM event_requests r
  LEFT JOIN classification_decisions cd
         ON cd.request_id = r.id AND cd.is_current
  WHERE r.id = p_request_id;
$fn$ LANGUAGE sql STABLE;
