-- ============================================================
-- Central College Events & Conferences
-- Migration 04 — Policy exceptions
--
-- Encodes the Event Policy Exception Approval Form:
--   B. Exception Requested ........ exception_types, policy_exceptions
--   C. Standard Policy ............ the counterfactual, captured before deciding
--   D. Impact Assessment .......... estimated_* columns
--   E. E&C Recommendation ......... recommendation_* columns
--   F. Final Authorization ........ authorization_* columns
--   G. Post-Event Documentation ... actual_* columns
--
-- Section G is what makes this governable rather than merely
-- documented: estimates are made by people who want to say yes,
-- actuals are what it cost. The gap between them is the finding.
-- ============================================================

CREATE TYPE exception_category AS ENUM (
  'pricing_fee_waiver',
  'classification_exception',
  'discount',
  'institutional_subsidy',
  'outside_caterer',
  'kitchen_equipment_access',
  'insurance_requirement',
  'food_safety_requirement',
  'alcohol_requirement',
  'capacity_scheduling',
  'other'
);

CREATE TYPE recommendation_state AS ENUM (
  'approve',
  'approve_with_conditions',
  'decline',
  'refer_to_higher_authority'
);

CREATE TYPE authorization_state AS ENUM (
  'approved',
  'approved_with_conditions',
  'denied'
);

CREATE TABLE policy_exceptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  reference_code          text UNIQUE NOT NULL
                            DEFAULT 'EX-' || to_char(now(), 'YY') || '-' ||
                                    lpad((floor(random() * 10000))::text, 4, '0'),

  -- A. Snapshot at the time of the request. The event's classification
  -- may later change; the exception must show what it was when decided.
  classification_at_request classification,
  ec_contact_id           uuid REFERENCES users(id),

  -- B. What is being asked for
  description             text NOT NULL,
  requester_reason        text,

  -- C. What would normally happen. Recorded before any decision so the
  -- counterfactual cannot be quietly rewritten to make the gap look small.
  normal_policy           text NOT NULL,
  normal_charge           numeric(10,2) CHECK (normal_charge >= 0),

  -- D. Impact assessment
  estimated_financial_impact  numeric(10,2),
  estimated_subsidy           numeric(10,2),
  staffing_impact             text,
  facility_impact             text,
  other_events_impact         text,
  risk_considerations         text,

  -- E. Events & Conferences recommendation
  recommendation          recommendation_state,
  recommendation_rationale text,
  recommended_conditions  text,
  recommended_by          uuid REFERENCES users(id),
  recommended_at          timestamptz,

  -- F. Final authorization
  authorization           authorization_state,
  final_decision          text,
  final_conditions        text,
  authorized_by           uuid REFERENCES users(id),
  authority_title         text,
  authorized_at           timestamptz,

  -- G. Post-event documentation
  actual_financial_impact numeric(10,2),
  actual_subsidy          numeric(10,2),
  post_event_notes        text,
  precedent_notes         text,
  documented_by           uuid REFERENCES users(id),
  documented_at           timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- An authorization must name who gave it and under what authority.
  CHECK (authorization IS NULL OR
         (authorized_by IS NOT NULL AND authority_title IS NOT NULL
          AND authorized_at IS NOT NULL)),
  CHECK (recommendation IS NULL OR
         (recommended_by IS NOT NULL AND recommended_at IS NOT NULL))
);

CREATE INDEX ON policy_exceptions (request_id);
CREATE INDEX ON policy_exceptions (authorization, authorized_at DESC);
CREATE INDEX ON policy_exceptions (authorized_at)
  WHERE authorization IN ('approved', 'approved_with_conditions');

-- One exception request can span several categories.
CREATE TABLE policy_exception_categories (
  exception_id uuid NOT NULL REFERENCES policy_exceptions(id) ON DELETE CASCADE,
  category     exception_category NOT NULL,
  PRIMARY KEY (exception_id, category)
);

-- ------------------------------------------------------------
-- An open exception forces the leadership tier.
-- Raising the trigger here means the escalation rules in
-- migration 03 pick it up with no extra application logic.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION raise_exception_trigger()
RETURNS trigger AS $$
DECLARE
  t_id uuid;
BEGIN
  SELECT id INTO t_id FROM review_triggers WHERE code = 'policy_exception';

  INSERT INTO request_triggers (request_id, trigger_id, auto_detected, detail)
  VALUES (NEW.request_id, t_id, true,
          'Policy exception ' || NEW.reference_code || ' requested')
  ON CONFLICT (request_id, trigger_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exception_raises_leadership_tier
  AFTER INSERT ON policy_exceptions
  FOR EACH ROW EXECUTE FUNCTION raise_exception_trigger();

-- ------------------------------------------------------------
-- Recommendation must precede authorization.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_exception_sequence()
RETURNS trigger AS $$
BEGIN
  IF NEW.authorization IS NOT NULL AND NEW.recommendation IS NULL THEN
    RAISE EXCEPTION
      'Exception % cannot be authorized before Events & Conferences records a recommendation',
      NEW.reference_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_exception_sequence
  BEFORE UPDATE ON policy_exceptions
  FOR EACH ROW EXECUTE FUNCTION check_exception_sequence();

-- ------------------------------------------------------------
-- Precedent. The question staff will actually be asked is
-- "you did this for them last year" — this answers it with
-- numbers instead of memory.
-- ------------------------------------------------------------

CREATE VIEW exception_precedent AS
SELECT
  pec.category,
  count(*)                                          AS times_requested,
  count(*) FILTER (WHERE pe.authorization IN
    ('approved','approved_with_conditions'))         AS times_approved,
  count(*) FILTER (WHERE pe.authorization = 'denied') AS times_denied,
  round(avg(pe.estimated_subsidy), 2)               AS avg_estimated_subsidy,
  round(avg(pe.actual_subsidy), 2)                  AS avg_actual_subsidy,
  sum(pe.actual_subsidy)                            AS total_actual_subsidy,
  max(pe.authorized_at)                             AS most_recent
FROM policy_exceptions pe
JOIN policy_exception_categories pec ON pec.exception_id = pe.id
GROUP BY pec.category
ORDER BY times_requested DESC;

-- Where estimates and reality diverge. Run this annually.
CREATE VIEW exception_estimate_accuracy AS
SELECT
  pe.reference_code,
  r.event_name,
  r.event_date,
  pe.estimated_subsidy,
  pe.actual_subsidy,
  pe.actual_subsidy - pe.estimated_subsidy AS variance,
  CASE WHEN pe.estimated_subsidy > 0
       THEN round(100.0 * (pe.actual_subsidy - pe.estimated_subsidy)
                  / pe.estimated_subsidy, 1)
  END AS variance_pct
FROM policy_exceptions pe
JOIN event_requests r ON r.id = pe.request_id
WHERE pe.actual_subsidy IS NOT NULL
  AND pe.estimated_subsidy IS NOT NULL
ORDER BY abs(pe.actual_subsidy - pe.estimated_subsidy) DESC;

-- Repeat askers. Not an accusation — a pattern worth seeing before
-- the fourth request rather than after it.
CREATE VIEW exception_requesters AS
SELECT
  u.full_name,
  u.department_org,
  count(*)                                           AS exceptions_requested,
  count(*) FILTER (WHERE pe.authorization IN
    ('approved','approved_with_conditions'))          AS approved,
  sum(pe.actual_subsidy)                             AS total_actual_subsidy
FROM policy_exceptions pe
JOIN event_requests r ON r.id = pe.request_id
JOIN users u ON u.id = r.requester_id
GROUP BY u.full_name, u.department_org
HAVING count(*) > 1
ORDER BY count(*) DESC;

-- Approved exceptions still missing their Section G actuals after
-- the event has passed. This is the list that quietly never gets
-- filled in unless someone is shown it.
CREATE VIEW exceptions_awaiting_documentation AS
SELECT
  pe.reference_code,
  r.event_name,
  r.event_date,
  pe.estimated_subsidy,
  CURRENT_DATE - r.event_date AS days_since_event
FROM policy_exceptions pe
JOIN event_requests r ON r.id = pe.request_id
WHERE pe.authorization IN ('approved','approved_with_conditions')
  AND pe.documented_at IS NULL
  AND r.event_date < CURRENT_DATE
ORDER BY r.event_date;

-- ------------------------------------------------------------
-- Register the trigger code used above.
-- ------------------------------------------------------------

INSERT INTO review_triggers (tier, code, label, auto_rule, sort_order)
VALUES ('leadership','policy_exception','Policy exception requested',
        'an open policy_exceptions row exists', 9)
ON CONFLICT (code) DO NOTHING;
