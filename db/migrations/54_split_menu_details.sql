-- ============================================================
-- Migration 54 - Menu and details become two steps
--
-- They were one page: choose food, describe the setup, confirm the
-- lot. That works for a coffee break and badly for a wedding, where
-- the menu is a conversation and the room setup is a different
-- conversation on a different day.
--
-- Splitting them also means the kitchen can start pricing while the
-- requester is still deciding where the head table goes.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN menu_confirmed_at timestamptz,
  ADD COLUMN menu_confirmed_by uuid REFERENCES users(id);

-- Anything already confirmed did both at once.
UPDATE event_requests
   SET menu_confirmed_at = details_confirmed_at,
       menu_confirmed_by = details_confirmed_by
 WHERE details_confirmed_at IS NOT NULL;

COMMENT ON COLUMN event_requests.menu_confirmed_at IS
  'The requester has settled the food. Setup and requirements may still be outstanding.';

-- Where a request stands in the two-step flow, as one answer so the
-- pages, the status notes and the staff view cannot disagree.
CREATE OR REPLACE FUNCTION details_stage(p_request_id uuid)
RETURNS text AS $fn$
  SELECT CASE
           WHEN NOT ready_for_details(p_request_id) THEN 'waiting'
           WHEN r.details_confirmed_at IS NOT NULL   THEN 'done'
           WHEN NOT has_central_dining(p_request_id) THEN 'details'
           WHEN r.menu_confirmed_at IS NULL          THEN 'menu'
           ELSE 'details'
         END
    FROM event_requests r
   WHERE r.id = p_request_id;
$fn$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION details_stage IS
  'waiting, menu, details or done. Events with no Central catering skip the menu stage entirely.';
