-- ============================================================
-- Migration 08 - Requester acknowledgement
--
-- Acknowledgement attaches to a specific classification decision
-- rather than to the request. If staff reclassify, the new row is
-- unacknowledged and the requester is asked again - they agreed to
-- something that has since changed.
-- ============================================================

ALTER TABLE classification_decisions
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN acknowledged_by uuid REFERENCES users(id);

CREATE INDEX ON classification_decisions (request_id)
  WHERE is_current AND acknowledged_at IS NULL;