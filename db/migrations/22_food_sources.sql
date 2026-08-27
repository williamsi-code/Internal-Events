-- ============================================================
-- Migration 22 - Facility charge and food source consequences
--
-- Where Central provides no food, the facility rate applies. Where
-- catering is split, the events office decides case by case: Central
-- is already being paid for its portion, so whether the room is also
-- charged is a judgement, not a rule.
--
-- The system suggests; staff decide and say why.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN facility_charge_applied numeric(10,2)
    CHECK (facility_charge_applied >= 0),
  ADD COLUMN facility_charge_note text,
  ADD COLUMN facility_charge_set_by uuid REFERENCES users(id),
  ADD COLUMN facility_charge_set_at timestamptz;

-- What the room would cost at the applicable tier, before any
-- judgement is applied.
CREATE OR REPLACE FUNCTION suggested_facility_charge(p_request_id uuid)
RETURNS numeric AS $$
  SELECT CASE
           -- Central is cooking everything: the room comes with it.
           WHEN NOT EXISTS (
             SELECT 1 FROM event_food_sources f
              WHERE f.request_id = p_request_id
                AND f.kind IN ('outside_caterer', 'donated')
           ) THEN 0
           -- Central is cooking nothing: full facility rate.
           WHEN NOT EXISTS (
             SELECT 1 FROM event_food_sources f
              WHERE f.request_id = p_request_id
                AND f.kind = 'central_dining'
           ) THEN CASE cd.classification
                    WHEN 'internal'   THEN s.facility_rate_internal
                    WHEN 'affiliated' THEN s.facility_rate_affiliated
                    WHEN 'external'   THEN s.facility_rate_external
                    ELSE 0
                  END
           -- Split. Suggest half, but this is the case staff decide.
           ELSE round(CASE cd.classification
                        WHEN 'internal'   THEN s.facility_rate_internal
                        WHEN 'affiliated' THEN s.facility_rate_affiliated
                        WHEN 'external'   THEN s.facility_rate_external
                        ELSE 0
                      END / 2, 2)
         END
    FROM event_requests r
    LEFT JOIN spaces s ON s.id = r.space_id
    LEFT JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
   WHERE r.id = p_request_id;
$$ LANGUAGE sql STABLE;

-- Is Central cooking any of this event?
CREATE OR REPLACE FUNCTION has_central_dining(p_request_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_food_sources f
     WHERE f.request_id = p_request_id AND f.kind = 'central_dining'
  );
$$ LANGUAGE sql STABLE;

-- Events where the catering is split, which is where the facility
-- charge needs a person rather than a rule.
CREATE VIEW split_catering_events AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  cd.classification,
  suggested_facility_charge(r.id) AS suggested_charge,
  r.facility_charge_applied,
  (r.facility_charge_applied IS NULL) AS needs_decision
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
WHERE EXISTS (
        SELECT 1 FROM event_food_sources f
         WHERE f.request_id = r.id AND f.kind = 'central_dining'
      )
  AND EXISTS (
        SELECT 1 FROM event_food_sources f
         WHERE f.request_id = r.id
           AND f.kind IN ('outside_caterer', 'donated')
      )
  AND r.status NOT IN ('cancelled', 'denied', 'completed');

-- An outside caterer appearing on an event is a management review
-- trigger on the decision sheet, so raise it when one is recorded.
CREATE OR REPLACE FUNCTION outside_caterer_raises_review()
RETURNS trigger AS $$
DECLARE
  t_id uuid;
BEGIN
  IF NEW.kind NOT IN ('outside_caterer', 'donated') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO t_id FROM review_triggers WHERE code = 'outside_caterer';
  IF t_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO request_triggers (request_id, trigger_id, auto_detected, detail)
  VALUES (NEW.request_id, t_id, true,
          CASE NEW.kind
            WHEN 'donated' THEN 'Donated food on this event'
            ELSE 'Outside caterer on this event'
          END)
  ON CONFLICT (request_id, trigger_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER food_source_raises_review
  AFTER INSERT ON event_food_sources
  FOR EACH ROW EXECUTE FUNCTION outside_caterer_raises_review();
