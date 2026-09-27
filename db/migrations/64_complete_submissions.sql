-- ============================================================
-- Migration 64 - A complete order goes through once
--
-- Somebody ordering coffee and pastries for a committee should not
-- be made to come back twice: once to accept a classification, again
-- to confirm a menu they already chose.
--
-- The reason that step existed was to stop anyone being charged a
-- price they had not seen. That reason does not apply here, because
-- the intake quote is at the standard rate - the highest tier there
-- is. Classification moves the price down or leaves it. The figure
-- they saw is the ceiling, so there is nothing to protect them
-- from.
--
-- So a complete submission is acknowledged for them when it is
-- classified, and they are told what happened rather than asked to
-- approve it.
-- ============================================================

CREATE OR REPLACE FUNCTION acknowledge_complete_submission()
RETURNS trigger AS $fn$
DECLARE
  req record;
BEGIN
  IF NOT NEW.is_current THEN RETURN NEW; END IF;

  SELECT id, submitted_complete, acknowledged_at, status
    INTO req
    FROM event_requests WHERE id = NEW.request_id;

  IF req IS NULL OR NOT req.submitted_complete THEN RETURN NEW; END IF;
  IF req.acknowledged_at IS NOT NULL THEN RETURN NEW; END IF;

  UPDATE event_requests
     SET acknowledged_at = now(),
         acknowledged_by = NEW.decided_by,
         updated_at = now()
   WHERE id = NEW.request_id;

  INSERT INTO request_status_history
    (request_id, from_status, to_status, changed_by, reason)
  VALUES
    (NEW.request_id, req.status, req.status, NEW.decided_by,
     'Accepted automatically: the requester gave everything at intake and the quoted price can only fall');

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS acknowledge_complete ON classification_decisions;
CREATE TRIGGER acknowledge_complete
  AFTER INSERT ON classification_decisions
  FOR EACH ROW
  EXECUTE FUNCTION acknowledge_complete_submission();

-- What a requester is told after classification, rather than asked.
CREATE OR REPLACE FUNCTION price_change_summary(p_request_id uuid)
RETURNS TABLE (
  quoted_at_intake numeric,
  charged_now numeric,
  saved numeric,
  classification text
) AS $fn$
  SELECT
    coalesce(sum(sel.quantity * ext.unit_price), 0),
    coalesce(sum(sel.quantity * sel.unit_price_quoted), 0),
    coalesce(sum(sel.quantity * ext.unit_price), 0)
      - coalesce(sum(sel.quantity * sel.unit_price_quoted), 0),
    cd.classification::text
  FROM request_menu_selections sel
  JOIN LATERAL (
    SELECT p.unit_price FROM menu_item_prices p
     WHERE p.menu_item_id = sel.menu_item_id
       AND p.path = 'external_commercial'
       AND p.effective_from <= CURRENT_DATE
       AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
     ORDER BY p.effective_from DESC LIMIT 1
  ) ext ON true
  LEFT JOIN classification_decisions cd
         ON cd.request_id = sel.request_id AND cd.is_current
  WHERE sel.request_id = p_request_id
  GROUP BY cd.classification;
$fn$ LANGUAGE sql STABLE;
