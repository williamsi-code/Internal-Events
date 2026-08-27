-- ============================================================
-- Migration 21 - Facility rates
--
-- When an outside caterer provides the food, Central cooks nothing
-- and the menu tiers have nothing to price. What remains is the
-- room, which still needs setting up, cleaning, and staffing.
--
-- Rates sit on the space rather than in a separate table because
-- that is how the events office thinks about them: what does the
-- Ballroom cost. Three tiers, matching classification.
--
-- Internal defaults to zero: a department using a room is not a
-- transaction, it is the College using its own building.
-- ============================================================

ALTER TABLE spaces
  ADD COLUMN facility_rate_internal   numeric(10,2) NOT NULL DEFAULT 0
    CHECK (facility_rate_internal >= 0),
  ADD COLUMN facility_rate_affiliated numeric(10,2) NOT NULL DEFAULT 0
    CHECK (facility_rate_affiliated >= 0),
  ADD COLUMN facility_rate_external   numeric(10,2) NOT NULL DEFAULT 0
    CHECK (facility_rate_external >= 0),
  ADD COLUMN rate_basis text NOT NULL DEFAULT 'per event';

COMMENT ON COLUMN spaces.rate_basis IS
  'How the facility rate is applied: per event, per hour, per day.';

-- PLACEHOLDER RATES. Replace with Central's actual figures in
-- Back office - Event spaces. Internal stays at zero deliberately.
UPDATE spaces SET
  facility_rate_affiliated = CASE
    WHEN coalesce(capacity_standing, capacity_seated, 0) >= 250 THEN 300
    WHEN coalesce(capacity_standing, capacity_seated, 0) >= 100 THEN 175
    ELSE 75
  END,
  facility_rate_external = CASE
    WHEN coalesce(capacity_standing, capacity_seated, 0) >= 250 THEN 750
    WHEN coalesce(capacity_standing, capacity_seated, 0) >= 100 THEN 425
    ELSE 200
  END
WHERE facility_rate_affiliated = 0 AND facility_rate_external = 0;

-- What a given request would be charged for its room, if anything.
CREATE OR REPLACE FUNCTION facility_charge(p_request_id uuid)
RETURNS numeric AS $$
  SELECT CASE cd.classification
           WHEN 'internal'   THEN s.facility_rate_internal
           WHEN 'affiliated' THEN s.facility_rate_affiliated
           WHEN 'external'   THEN s.facility_rate_external
           ELSE 0
         END
    FROM event_requests r
    JOIN spaces s ON s.id = r.space_id
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
   WHERE r.id = p_request_id;
$$ LANGUAGE sql STABLE;
