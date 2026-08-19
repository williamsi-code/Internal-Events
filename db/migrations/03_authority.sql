-- ============================================================
-- Central College Events & Conferences
-- Migration 03 — Staff authority, escalation triggers, direction
--
-- Encodes the Staff Classification Decision Sheet:
--   D. Staff Authority Check ....... authority_actions
--   E. Management Review Triggers .. review_triggers (management)
--   F. Leadership Exception ........ review_triggers (leadership)
--   G. Final Direction ............. final_directions
--
-- The escalation level is DERIVED from triggers, never chosen.
-- A reviewer cannot route past a fired trigger.
-- ============================================================

CREATE TYPE review_tier AS ENUM ('staff', 'management', 'leadership');

CREATE TYPE final_direction AS ENUM (
  'proceed',
  'proceed_with_conditions',
  'revise_proposal',
  'decline',
  'escalate_further'
);

-- ------------------------------------------------------------
-- D. What designated staff may do without escalating
-- ------------------------------------------------------------

CREATE TABLE authority_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO authority_actions (code, label, sort_order) VALUES
  ('apply_classification',   'Apply established classification', 1),
  ('apply_pricing',          'Apply established pricing', 2),
  ('recommend_service',      'Recommend service level', 3),
  ('determine_feasibility',  'Determine operational feasibility', 4),
  ('prepare_estimate',       'Prepare standard estimate', 5),
  ('recommend_alternate',    'Recommend alternate date, time, menu or service', 6),
  ('enforce_deadlines',      'Enforce deadlines and guarantees', 7),
  ('outside_caterer_reqs',   'Apply approved outside caterer requirements', 8);

CREATE TABLE request_authority_claims (
  request_id  uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  action_id   uuid NOT NULL REFERENCES authority_actions(id),
  claimed_by  uuid NOT NULL REFERENCES users(id),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, action_id)
);

-- ------------------------------------------------------------
-- E and F. Escalation triggers
--
-- auto_rule names the condition the application evaluates to
-- pre-tick a trigger. NULL means only a human can raise it.
-- ------------------------------------------------------------

CREATE TABLE review_triggers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier        review_tier NOT NULL CHECK (tier <> 'staff'),
  code        text UNIQUE NOT NULL,
  label       text NOT NULL,
  auto_rule   text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO review_triggers (tier, code, label, auto_rule, sort_order) VALUES
  -- E. Management review
  ('management','classification_unclear','Classification unclear',
   'classification = needs_management_review OR answers deviate from event type', 1),
  ('management','affiliated_event','Affiliated event',
   'classification = affiliated', 2),
  ('management','internal_revenue','Revenue-generating Internal program',
   'classification = internal AND revenue_collected', 3),
  ('management','capacity_conflict','Capacity conflict',
   'any capacity check unconfirmed', 4),
  ('management','outside_caterer','Outside caterer request',
   'requirements mention an outside caterer', 5),
  ('management','unusual_financial','Unusual financial arrangement',
   'outside funding OR revenue recipient is not Central', 6),
  ('management','significant_change','Significant operational change', NULL, 7),
  ('management','discount_in_authority','Discount within management authority', NULL, 8),

  -- F. Leadership exception
  ('leadership','waive_charge','Waive established charge', NULL, 1),
  ('leadership','change_classification','Change classification as an exception', NULL, 2),
  ('leadership','major_discount','Unauthorized or major discount', NULL, 3),
  ('leadership','college_subsidy','Significant College subsidy', NULL, 4),
  ('leadership','waive_requirements','Waive insurance, food safety or alcohol requirements', NULL, 5),
  ('leadership','policy_exception','Major policy exception', NULL, 6),
  ('leadership','high_risk','High-risk situation', NULL, 7),
  ('leadership','priority_conflict','Major conflict of institutional and commercial priorities', NULL, 8);

CREATE TABLE request_triggers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  trigger_id    uuid NOT NULL REFERENCES review_triggers(id),
  -- Distinguishes rule-detected from reviewer-raised. Useful for
  -- auditing whether the automatic rules are catching the right cases.
  auto_detected boolean NOT NULL DEFAULT false,
  detail        text,
  raised_by     uuid REFERENCES users(id),
  raised_at     timestamptz NOT NULL DEFAULT now(),
  cleared_at    timestamptz,
  cleared_by    uuid REFERENCES users(id),
  clear_reason  text,
  UNIQUE (request_id, trigger_id)
);

CREATE INDEX ON request_triggers (request_id) WHERE cleared_at IS NULL;

-- Derived escalation tier. Leadership beats management beats staff.
-- Read this rather than storing a tier anyone can edit.
CREATE VIEW request_review_tier AS
SELECT
  r.id AS request_id,
  CASE
    WHEN bool_or(t.tier = 'leadership') THEN 'leadership'
    WHEN bool_or(t.tier = 'management') THEN 'management'
    ELSE 'staff'
  END::review_tier AS required_tier,
  count(*) FILTER (WHERE t.tier = 'management') AS management_triggers,
  count(*) FILTER (WHERE t.tier = 'leadership') AS leadership_triggers
FROM event_requests r
LEFT JOIN request_triggers rt
       ON rt.request_id = r.id AND rt.cleared_at IS NULL
LEFT JOIN review_triggers t ON t.id = rt.trigger_id
GROUP BY r.id;

-- ------------------------------------------------------------
-- Escalation sign-offs. One row per tier that was required.
-- ------------------------------------------------------------

CREATE TABLE escalation_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  tier          review_tier NOT NULL CHECK (tier <> 'staff'),
  question      text NOT NULL,
  decision      text,
  conditions    text,
  reviewer_id   uuid REFERENCES users(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  UNIQUE (request_id, tier)
);

CREATE INDEX ON escalation_reviews (tier, decided_at)
  WHERE decided_at IS NULL;

-- ------------------------------------------------------------
-- G. Final direction
-- ------------------------------------------------------------

CREATE TABLE final_directions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  direction    final_direction NOT NULL,
  instructions text,
  conditions   text,
  issued_by    uuid NOT NULL REFERENCES users(id),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  is_current   boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX one_current_direction
  ON final_directions (request_id) WHERE is_current;

-- ------------------------------------------------------------
-- Guard: a direction of 'proceed' may not be issued while an
-- uncleared trigger still awaits its escalation sign-off.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_direction_authority()
RETURNS trigger AS $$
DECLARE
  required review_tier;
  signed   boolean;
BEGIN
  IF NEW.direction NOT IN ('proceed', 'proceed_with_conditions') THEN
    RETURN NEW;
  END IF;

  SELECT required_tier INTO required
    FROM request_review_tier WHERE request_id = NEW.request_id;

  IF required = 'staff' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM escalation_reviews
     WHERE request_id = NEW.request_id
       AND tier = required
       AND decided_at IS NOT NULL
  ) INTO signed;

  IF NOT signed THEN
    RAISE EXCEPTION
      'Request % requires % sign-off before it can proceed',
      NEW.request_id, required;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_direction_authority
  BEFORE INSERT ON final_directions
  FOR EACH ROW EXECUTE FUNCTION check_direction_authority();

-- ------------------------------------------------------------
-- Staff-facing: what is sitting on a manager's desk right now
-- ------------------------------------------------------------

CREATE VIEW escalation_queue AS
SELECT
  r.reference_code,
  r.event_name,
  r.event_date,
  tier.required_tier,
  er.tier          AS awaiting_tier,
  er.question,
  er.requested_at,
  now() - er.requested_at AS waiting_for,
  string_agg(t.label, '; ' ORDER BY t.sort_order) AS triggers
FROM event_requests r
JOIN request_review_tier tier ON tier.request_id = r.id
JOIN escalation_reviews er
  ON er.request_id = r.id AND er.decided_at IS NULL
LEFT JOIN request_triggers rt
  ON rt.request_id = r.id AND rt.cleared_at IS NULL
LEFT JOIN review_triggers t ON t.id = rt.trigger_id
WHERE r.status NOT IN ('cancelled', 'denied', 'completed')
GROUP BY r.reference_code, r.event_name, r.event_date,
         tier.required_tier, er.tier, er.question, er.requested_at
ORDER BY r.event_date;
