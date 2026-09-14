-- ============================================================
-- Migration 58 - The retired answers become nullable
--
-- Migration 57 stopped asking two questions but left their columns
-- NOT NULL, so every new request fails at the database.
--
-- Null is the right value: nobody was asked, so there is no answer.
-- Writing 'unclear' would be a claim the requester never made, and
-- an event from 2027 would be indistinguishable from one where
-- somebody genuinely did not know.
-- ============================================================

ALTER TABLE classification_answers
  ALTER COLUMN would_occur_without DROP NOT NULL;

-- event_owner was made nullable in 57; make sure, in case that
-- migration ran against a schema where it had a default.
ALTER TABLE classification_answers
  ALTER COLUMN event_owner DROP NOT NULL;

COMMENT ON COLUMN classification_answers.would_occur_without IS
  'No longer asked. Null on anything submitted after September 2026.';

-- Anything else the form stopped sending. Checked rather than
-- assumed, because this is the fourth time a column has outlived the
-- question that filled it.
DO $block$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND is_nullable = 'NO'
       AND column_default IS NULL
       AND table_name IN ('classification_answers', 'event_funding')
       AND column_name IN (
         'event_owner', 'would_occur_without', 'outside_org_involved',
         'outside_funding', 'revenue_collected'
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL',
      col.table_name, col.column_name
    );
    RAISE NOTICE 'Made %.% nullable', col.table_name, col.column_name;
  END LOOP;
END
$block$;
