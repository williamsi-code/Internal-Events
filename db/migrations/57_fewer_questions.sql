-- ============================================================
-- Migration 57 - Fewer questions, combined into one section
--
-- Sections C and D asked nine things. Two of them - who owns and
-- controls the event, and whether an outside organization is
-- involved - restated what the funding answers already said. A
-- requester answering both was being asked the same question twice
-- in different words, which produces worse answers rather than more.
--
-- Two others stay: who benefits and who pays. The classification
-- policy is written in those terms, and without them the advisory
-- verdict has nothing to work from but the event type.
--
-- The columns stay, nullable, because eighteen months of decisions
-- were made with them and a report that suddenly cannot read old
-- events is worse than a column nobody writes to.
-- ============================================================

ALTER TABLE classification_answers
  ALTER COLUMN event_owner DROP NOT NULL;

ALTER TABLE event_funding
  ALTER COLUMN outside_org_involved DROP NOT NULL;

COMMENT ON COLUMN classification_answers.event_owner IS
  'No longer asked. Kept for events submitted before September 2026.';

COMMENT ON COLUMN event_funding.outside_org_involved IS
  'No longer asked directly. Inferred from whether an outside organization was named.';

-- ------------------------------------------------------------
-- The advisory classification, on what is still asked
--
-- Previously this weighed five answers. It now weighs three, plus
-- the funding picture, which is the part that was doing most of the
-- work anyway.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION advisory_classification(p_request_id uuid)
RETURNS TABLE (suggestion text, rationale text, confident boolean) AS $fn$
DECLARE
  a record;
  f record;
  t record;
BEGIN
  SELECT * INTO a FROM classification_answers WHERE request_id = p_request_id;
  SELECT * INTO f FROM event_funding WHERE request_id = p_request_id;

  SELECT et.default_classification, et.always_review
    INTO t
    FROM event_requests r
    LEFT JOIN event_types et ON et.id = r.event_type_id
   WHERE r.id = p_request_id;

  -- An outside party benefiting and paying is external, whatever the
  -- event type says.
  IF a.primary_beneficiary = 'outside' AND a.primary_payer = 'outside' THEN
    RETURN QUERY SELECT
      'external',
      'An outside party both benefits and pays.',
      true;
    RETURN;
  END IF;

  -- Central business, Central benefit, Central money.
  IF a.official_business = 'yes'
     AND a.primary_beneficiary = 'central'
     AND a.primary_payer = 'central'
     AND coalesce(f.outside_funding, false) = false THEN
    RETURN QUERY SELECT
      'internal',
      'Official College business, benefiting and paid for by Central.',
      true;
    RETURN;
  END IF;

  -- Shared benefit, or outside money against Central benefit, is the
  -- shape affiliated exists to describe.
  IF a.primary_beneficiary = 'shared'
     OR a.primary_payer = 'shared'
     OR (a.primary_beneficiary = 'central' AND a.primary_payer = 'outside')
     OR coalesce(f.outside_funding, false) THEN
    RETURN QUERY SELECT
      'affiliated',
      'Central and an outside party both have a stake in this one.',
      false;
    RETURN;
  END IF;

  -- Revenue collected for someone other than Central is a flag
  -- whatever else is true.
  IF coalesce(f.revenue_collected, false)
     AND f.revenue_recipient IS NOT NULL THEN
    RETURN QUERY SELECT
      'needs_management_review',
      'Revenue is being collected, which needs a look before pricing.',
      false;
    RETURN;
  END IF;

  IF t.always_review OR t.default_classification IS NULL THEN
    RETURN QUERY SELECT
      'needs_management_review',
      'The answers do not settle it and the event type is not decisive.',
      false;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    t.default_classification::text,
    'Following the usual result for this event type; nothing in the answers argues against it.',
    false;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- Does the requester's picture disagree with the event type? This is
-- the flag staff actually act on, so it survives the simplification.
CREATE OR REPLACE FUNCTION deviates_from_type(p_request_id uuid)
RETURNS boolean AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM event_requests r
      JOIN event_types et ON et.id = r.event_type_id
      JOIN classification_answers a ON a.request_id = r.id
      CROSS JOIN LATERAL advisory_classification(r.id) adv
     WHERE r.id = p_request_id
       AND et.default_classification IS NOT NULL
       AND adv.suggestion <> et.default_classification::text
  );
$fn$ LANGUAGE sql STABLE;
