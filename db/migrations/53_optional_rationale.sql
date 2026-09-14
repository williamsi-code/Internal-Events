-- ============================================================
-- Migration 53 - A rationale is optional
--
-- The column was NOT NULL from the original schema, when every
-- decision had to be explained. The interface now asks for one only
-- where it matters - an override, an always-reviewed type, a type
-- the requester typed themselves - so a decision that simply matches
-- the matrix now fails at the database.
--
-- This is the second time a field became optional in the form and
-- not in the schema. Worth checking the others at some point rather
-- than discovering them one at a time.
-- ============================================================

ALTER TABLE classification_decisions
  ALTER COLUMN rationale DROP NOT NULL;

-- Placeholders written to satisfy the old constraint should read as
-- absent rather than as a stated reason.
UPDATE classification_decisions
   SET rationale = NULL
 WHERE trim(coalesce(rationale, '')) IN
       ('', '-', '.', 'n/a', 'N/A', 'na', 'none', 'None');

COMMENT ON COLUMN classification_decisions.rationale IS
  'Optional. Required by the interface only when the decision departs from the matrix default, which is when someone will later ask why.';
