-- ============================================================
-- Migration 63 - One form, and staff decide
--
-- The intake form asked the requester to answer the classification
-- matrix: who owns this, who benefits, who would pay. Reasonable
-- questions for someone who has read the policy, and bewildering for
-- a department secretary booking a lunch.
--
-- Worse, the answers were advisory anyway. Staff read them, formed
-- their own view from the funding and the description, and recorded
-- that. The questions were a ritual that produced worse data than
-- simply asking what the event is.
--
-- So: one page, plain questions, and the events office classifies
-- from what it is told. The matrix stays in the policy documents
-- where it belongs.
--
-- The second change: a requester who knows what they want can say so
-- at intake rather than being made to come back. Menu chosen before
-- classification is quoted at the standard rate and repriced when
-- the classification is recorded - the same machinery the public
-- ordering page has used since it was built.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The classification answers become optional in full
--
-- The columns stay. Two years of decisions were recorded alongside
-- them, and a report that cannot read old events is a worse problem
-- than a few unused columns.
-- ------------------------------------------------------------

ALTER TABLE classification_answers
  ALTER COLUMN official_business DROP NOT NULL,
  ALTER COLUMN primary_beneficiary DROP NOT NULL,
  ALTER COLUMN primary_payer DROP NOT NULL;

COMMENT ON TABLE classification_answers IS
  'No longer asked of requesters from September 2026. Kept for events submitted before then, and for the notes field, which is still filled in.';

-- The event type keeps its reporting job and loses its deciding one.
COMMENT ON COLUMN event_types.default_classification IS
  'Reference only. No longer drives an advisory classification - staff decide from the funding picture and the description.';

-- ------------------------------------------------------------
-- 2. What the requester tells us instead
--
-- Fewer questions, in plainer words, answering what staff actually
-- need to know.
-- ------------------------------------------------------------

ALTER TABLE event_requests
  -- "Tell us about your event" in their own words. This does more
  -- work than five dropdowns did.
  ADD COLUMN event_description text,
  -- Whether the requester wanted to settle everything at once.
  ADD COLUMN submitted_complete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN event_requests.event_description IS
  'What the event is, in the requester''s words. The main thing staff classify from.';

COMMENT ON COLUMN event_requests.submitted_complete IS
  'The requester gave menu and setup at intake rather than coming back for them.';

-- ------------------------------------------------------------
-- 3. Repricing when a classification lands
--
-- A menu chosen before classification is quoted at the standard
-- rate. When staff classify, every such line is repriced to the
-- tier they decided on.
--
-- This already existed for the public ordering page; it now has to
-- fire for ordinary requests too.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION reprice_on_classification()
RETURNS trigger AS $fn$
DECLARE
  tier financial_path;
  revenue boolean;
BEGIN
  IF NOT NEW.is_current THEN RETURN NEW; END IF;

  SELECT coalesce(f.revenue_collected, false) INTO revenue
    FROM event_funding f WHERE f.request_id = NEW.request_id;

  SELECT CASE
           WHEN cp.classification = 'internal' AND revenue
             THEN cp.revenue_path
           ELSE cp.path
         END
    INTO tier
    FROM classification_pricing cp
   WHERE cp.classification = NEW.classification;

  IF tier IS NULL THEN RETURN NEW; END IF;

  UPDATE request_menu_selections sel
     SET unit_price_quoted = coalesce(
           (SELECT p.unit_price
              FROM menu_item_prices p
             WHERE p.menu_item_id = sel.menu_item_id
               AND p.path = tier
               AND p.effective_from <= CURRENT_DATE
               AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
             ORDER BY p.effective_from DESC
             LIMIT 1),
           sel.unit_price_quoted
         ),
         quoted_before_classification = false
   WHERE sel.request_id = NEW.request_id
     AND sel.quoted_before_classification;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reprice_after_classification ON classification_decisions;
CREATE TRIGGER reprice_after_classification
  AFTER INSERT ON classification_decisions
  FOR EACH ROW
  EXECUTE FUNCTION reprice_on_classification();

-- ------------------------------------------------------------
-- 4. What staff need in front of them to decide
--
-- Everything relevant to a classification in one row, so the
-- decision panel does not have to assemble it from six tables.
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW classification_context AS
SELECT
  r.id AS request_id,
  r.reference_code,
  r.event_name,
  r.event_description,
  r.department_org,
  r.contact_email,
  r.requester_name,
  et.name AS event_type_name,
  et.default_classification::text AS type_hint,
  r.event_type_other,

  f.budget_account,
  f.outside_org_name,
  f.outside_funding,
  f.outside_funding_detail,
  f.revenue_collected,
  f.revenue_recipient,
  f.financial_risk_bearer::text,

  a.requester_notes,

  -- Whether this requester, or this department, has been classified
  -- before. Consistency matters more than any single judgement.
  (SELECT cd.classification::text
     FROM event_requests pr
     JOIN classification_decisions cd
       ON cd.request_id = pr.id AND cd.is_current
    WHERE pr.id <> r.id
      AND (pr.customer_id = r.customer_id AND r.customer_id IS NOT NULL
           OR pr.contact_email = r.contact_email)
    ORDER BY pr.event_date DESC
    LIMIT 1) AS previous_classification,

  (SELECT count(*)::int
     FROM event_requests pr
     JOIN classification_decisions cd
       ON cd.request_id = pr.id AND cd.is_current
    WHERE pr.id <> r.id
      AND (pr.customer_id = r.customer_id AND r.customer_id IS NOT NULL
           OR pr.contact_email = r.contact_email)) AS previous_events,

  r.submitted_complete,
  (SELECT count(*)::int FROM request_menu_selections s
    WHERE s.request_id = r.id) AS menu_lines,
  (SELECT count(*)::int FROM request_menu_selections s
    WHERE s.request_id = r.id AND s.quoted_before_classification)
    AS awaiting_reprice
FROM event_requests r
LEFT JOIN event_types et ON et.id = r.event_type_id
LEFT JOIN event_funding f ON f.request_id = r.id
LEFT JOIN classification_answers a ON a.request_id = r.id;

-- ------------------------------------------------------------
-- 5. Where a complete submission goes next
--
-- A requester who gave everything at intake should not be sent back
-- through a menu step they have already done. They still see their
-- classification and what it costs - the price may have moved - but
-- confirming it is one button rather than a form.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION details_stage(p_request_id uuid)
RETURNS text AS $fn$
  SELECT CASE
           WHEN NOT ready_for_details(p_request_id) THEN 'waiting'
           WHEN r.details_confirmed_at IS NOT NULL   THEN 'done'
           -- Gave everything at intake and nothing has been reopened:
           -- there is nothing left to ask for.
           WHEN r.submitted_complete
                AND r.menu_confirmed_at IS NOT NULL  THEN 'done'
           WHEN NOT has_central_dining(p_request_id) THEN 'details'
           WHEN r.menu_confirmed_at IS NULL          THEN 'menu'
           ELSE 'details'
         END
    FROM event_requests r
   WHERE r.id = p_request_id;
$fn$ LANGUAGE sql STABLE;
