-- ============================================================
-- Migration 11 - Details confirmation
--
-- The gate that turns tentative into confirmed: classification
-- acknowledged AND details confirmed. Acknowledgement already
-- lives on classification_decisions; this records the other half.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN details_confirmed_at timestamptz,
  ADD COLUMN details_confirmed_by uuid REFERENCES users(id);

-- Selections are replaced wholesale on each save, so a stable
-- lookup by request matters more than by row.
CREATE INDEX IF NOT EXISTS request_menu_selections_request_idx
  ON request_menu_selections (request_id);

-- Which price tier applies to a classification. Kept as data so the
-- events office can change the mapping without a code deploy - for
-- instance if internal ticketed events stop paying a premium.
CREATE TABLE classification_pricing (
  classification    classification PRIMARY KEY,
  path              financial_path NOT NULL,
  revenue_path      financial_path,
  notes             text
);

INSERT INTO classification_pricing (classification, path, revenue_path, notes) VALUES
  ('internal',   'internal_non_revenue', 'internal_revenue_generating',
   'Food and disposables at cost. Ticketed internal events use the revenue-generating tier.'),
  ('affiliated', 'affiliated_cost_recovery', NULL,
   'Partnership cost-recovery rate.'),
  ('external',   'external_commercial', NULL,
   'Commercial rate.');

-- needs_management_review has no row on purpose: an event that is not
-- yet classified has no price tier, and the details step stays closed
-- until a manager settles it.