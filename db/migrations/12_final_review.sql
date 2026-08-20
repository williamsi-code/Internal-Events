-- ============================================================
-- Migration 12 - Final review checkpoint
--
-- Confirming details no longer moves an event straight to
-- confirmed. It moves to pending_final_review, where staff see
-- what has changed since classification and either confirm or
-- reclassify.
--
-- The check is a prompt, not a mandate: most events change
-- nothing material, and forcing a review on all of them costs
-- staff time they do not have.
-- ============================================================

ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'pending_final_review'
  BEFORE 'confirmed';

ALTER TABLE event_requests
  ADD COLUMN final_reviewed_at timestamptz,
  ADD COLUMN final_reviewed_by uuid REFERENCES users(id);

-- What the request looked like when it was classified. Comparing
-- against this is what makes "something changed" answerable rather
-- than a matter of someone remembering.
CREATE TABLE classification_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id          uuid NOT NULL REFERENCES classification_decisions(id) ON DELETE CASCADE,
  request_id           uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  estimated_attendance integer,
  event_date           date,
  space_id             uuid REFERENCES spaces(id),
  outside_org_involved boolean,
  outside_funding      boolean,
  revenue_collected    boolean,
  revenue_recipient    text,
  food_needs           text,
  captured_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id)
);

CREATE INDEX ON classification_snapshots (request_id);

-- Capture a snapshot automatically whenever a classification is
-- recorded, so nothing depends on the application remembering to.
CREATE OR REPLACE FUNCTION capture_classification_snapshot()
RETURNS trigger AS $$
BEGIN
  INSERT INTO classification_snapshots (
    decision_id, request_id, estimated_attendance, event_date, space_id,
    outside_org_involved, outside_funding, revenue_collected,
    revenue_recipient, food_needs
  )
  SELECT NEW.id, r.id, r.estimated_attendance, r.event_date, r.space_id,
         f.outside_org_involved, f.outside_funding, f.revenue_collected,
         f.revenue_recipient, req.food_needs
    FROM event_requests r
    LEFT JOIN event_funding f ON f.request_id = r.id
    LEFT JOIN event_requirements req ON req.request_id = r.id
   WHERE r.id = NEW.request_id
  ON CONFLICT (decision_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER snapshot_on_classification
  AFTER INSERT ON classification_decisions
  FOR EACH ROW EXECUTE FUNCTION capture_classification_snapshot();

-- Backfill for decisions already recorded, so existing test data
-- has something to compare against.
INSERT INTO classification_snapshots (
  decision_id, request_id, estimated_attendance, event_date, space_id,
  outside_org_involved, outside_funding, revenue_collected,
  revenue_recipient, food_needs
)
SELECT cd.id, r.id, r.estimated_attendance, r.event_date, r.space_id,
       f.outside_org_involved, f.outside_funding, f.revenue_collected,
       f.revenue_recipient, req.food_needs
  FROM classification_decisions cd
  JOIN event_requests r ON r.id = cd.request_id
  LEFT JOIN event_funding f ON f.request_id = r.id
  LEFT JOIN event_requirements req ON req.request_id = r.id
ON CONFLICT (decision_id) DO NOTHING;
