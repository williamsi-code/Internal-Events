-- ============================================================
-- Migration 51 - Event purpose is optional
--
-- The column was NOT NULL from the original schema, when the intake
-- form insisted on a purpose. Both forms have since made it
-- optional, so a blank one now fails at the database rather than
-- being caught by validation - which is the right way round for the
-- error to surface, but the wrong answer.
--
-- "Anderson Wedding" is a complete description of an Anderson
-- wedding. Requiring a sentence about why it is happening produces
-- filler, not information.
-- ============================================================

ALTER TABLE event_requests
  ALTER COLUMN event_purpose DROP NOT NULL;

-- Anything already storing a placeholder to satisfy the constraint
-- should read as absent rather than as a stated purpose.
UPDATE event_requests
   SET event_purpose = NULL
 WHERE trim(coalesce(event_purpose, '')) IN ('', '-', 'n/a', 'N/A', 'na');

COMMENT ON COLUMN event_requests.event_purpose IS
  'Optional. Many events explain themselves from the name alone.';
