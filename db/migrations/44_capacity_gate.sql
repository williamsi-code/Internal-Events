-- ============================================================
-- Migration 44 - Capacity before menu, and answering an alternative
--
-- Two problems in the flow.
--
-- First, the menu step was gated only on the requester
-- acknowledging their classification. Nothing stopped someone
-- choosing a menu for an event the kitchen cannot staff, which
-- wastes their time and makes the eventual decline much harder.
-- Capacity now has to be confirmed first.
--
-- Second, an offered alternative was posted as a message and
-- nothing more. The requester saw prose where they needed a
-- decision, and staff had no record of an answer.
-- ============================================================

CREATE TYPE alternative_response AS ENUM ('accepted', 'declined', 'pending');

ALTER TABLE capacity_checks
  ADD COLUMN alternative_response alternative_response,
  ADD COLUMN responded_at timestamptz,
  ADD COLUMN response_note text;

-- Where an event stands on capacity, as one answer rather than three
-- queries. Used by the requester's page, the details gate and the
-- staff view, so they cannot disagree.
CREATE OR REPLACE FUNCTION capacity_state(p_request_id uuid)
RETURNS TABLE (
  outcome text,
  checked_at timestamptz,
  proposed_date date,
  proposed_space_id uuid,
  proposed_space_name text,
  proposed_detail text,
  response text,
  concerns text
) AS $$
  SELECT cc.outcome::text,
         cc.checked_at,
         cc.proposed_date,
         cc.proposed_space_id,
         s.name,
         cc.proposed_detail,
         cc.alternative_response::text,
         cc.concerns
    FROM capacity_checks cc
    LEFT JOIN spaces s ON s.id = cc.proposed_space_id
   WHERE cc.request_id = p_request_id
   ORDER BY cc.checked_at DESC
   LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Is this event clear to choose a menu?
--
-- Three things have to be true: it is classified, the requester has
-- acknowledged that, and staff have confirmed we can actually do it.
CREATE OR REPLACE FUNCTION ready_for_details(p_request_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
      FROM event_requests r
      JOIN classification_decisions cd
        ON cd.request_id = r.id AND cd.is_current
     WHERE r.id = p_request_id
       AND cd.classification IS NOT NULL
       AND cd.classification <> 'needs_management_review'
       AND cd.acknowledged_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM capacity_checks cc
          WHERE cc.request_id = r.id
            AND cc.outcome = 'proceed'
       )
  );
$$ LANGUAGE sql STABLE;

-- Accepting an alternative moves the event to what was offered.
-- Doing it in one place means the date on the request, the booking
-- and the schedule cannot end up disagreeing.
CREATE OR REPLACE FUNCTION accept_alternative(p_request_id uuid, p_user uuid)
RETURNS void AS $$
DECLARE
  alt record;
BEGIN
  SELECT cc.id, cc.proposed_date, cc.proposed_space_id
    INTO alt
    FROM capacity_checks cc
   WHERE cc.request_id = p_request_id
     AND cc.outcome = 'alternative_offered'
   ORDER BY cc.checked_at DESC
   LIMIT 1;

  IF alt IS NULL THEN
    RAISE EXCEPTION 'No alternative has been offered for this event';
  END IF;

  UPDATE capacity_checks
     SET alternative_response = 'accepted', responded_at = now()
   WHERE id = alt.id;

  UPDATE event_requests
     SET event_date = coalesce(alt.proposed_date, event_date),
         space_id   = coalesce(alt.proposed_space_id, space_id),
         status     = 'classified',
         updated_at = now()
   WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql;

-- Events waiting on the requester to answer an offer.
CREATE VIEW alternatives_outstanding AS
SELECT
  r.id AS request_id,
  r.reference_code,
  r.event_name,
  r.event_date,
  r.requester_name,
  cc.proposed_date,
  s.name AS proposed_space_name,
  cc.proposed_detail,
  cc.checked_at,
  (EXTRACT(day FROM now() - cc.checked_at))::int AS days_waiting
FROM capacity_checks cc
JOIN event_requests r ON r.id = cc.request_id
LEFT JOIN spaces s ON s.id = cc.proposed_space_id
WHERE cc.outcome = 'alternative_offered'
  AND cc.alternative_response IS NULL
  AND r.status NOT IN ('cancelled', 'denied', 'completed')
ORDER BY cc.checked_at;
