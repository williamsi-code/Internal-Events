-- ============================================================
-- Migration 55 - Short notice needs approval first
--
-- An event asked for tomorrow is not the same problem as an event
-- asked for in March. The kitchen has ordered, the staff are
-- rostered, and the room may already be set for something else.
--
-- So a request inside the notice period does not simply submit. It
-- asks first, and the events office says yes or no before anything
-- else happens - before classification, before a menu, before a
-- room is held.
--
-- The period is per room, because the rooms differ. A coffee urn in
-- a meeting room is not a plated dinner in the Vermeer, and the
-- office needs to be able to say so without asking a developer.
-- ============================================================

ALTER TABLE spaces
  ADD COLUMN minimum_notice_hours integer NOT NULL DEFAULT 48;

COMMENT ON COLUMN spaces.minimum_notice_hours IS
  'How far ahead this room must normally be booked. Zero means it can be taken at any notice. Anything shorter than this needs the events office to approve it first.';

-- Meeting rooms are easier to turn around than a banquet hall.
UPDATE spaces SET minimum_notice_hours = 24
 WHERE category = 'Meeting Venues'
   AND coalesce(capacity_seated, 0) <= 40;

-- The big rooms need more warning, not less.
UPDATE spaces SET minimum_notice_hours = 72
 WHERE coalesce(capacity_seated, 0) >= 150;

-- ------------------------------------------------------------
-- The request side
-- ------------------------------------------------------------

CREATE TYPE short_notice_state AS ENUM ('pending', 'approved', 'declined');

ALTER TABLE event_requests
  ADD COLUMN short_notice boolean NOT NULL DEFAULT false,
  ADD COLUMN short_notice_state short_notice_state,
  ADD COLUMN short_notice_reason text,
  ADD COLUMN short_notice_decided_at timestamptz,
  ADD COLUMN short_notice_decided_by uuid REFERENCES users(id),
  ADD COLUMN short_notice_note text;

COMMENT ON COLUMN event_requests.short_notice_reason IS
  'What the requester said about why it is late. Their words, not the office assessment.';

-- How much notice a given date and time gives, and whether that is
-- enough for the room. One definition, so the form, the API and the
-- staff view cannot disagree.
CREATE OR REPLACE FUNCTION notice_check(
  p_space_id uuid,
  p_date date,
  p_time time DEFAULT NULL
) RETURNS TABLE (
  hours_notice numeric,
  required_hours integer,
  is_short boolean,
  space_name text
) AS $fn$
  SELECT
    round(
      EXTRACT(epoch FROM (
        (p_date + coalesce(p_time, TIME '08:00'))
          AT TIME ZONE 'America/Chicago'
      ) - now()) / 3600.0,
      1
    ),
    coalesce(s.minimum_notice_hours, 48),
    EXTRACT(epoch FROM (
      (p_date + coalesce(p_time, TIME '08:00'))
        AT TIME ZONE 'America/Chicago'
    ) - now()) / 3600.0 < coalesce(s.minimum_notice_hours, 48),
    s.name
  FROM spaces s
  WHERE s.id = p_space_id;
$fn$ LANGUAGE sql STABLE;

-- Short-notice requests the office has not answered yet. These need
-- to be the first thing anyone sees: an unanswered one is worse than
-- an unclassified one, because the date is hours away.
CREATE OR REPLACE VIEW short_notice_waiting AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  r.start_time,
  r.requester_name,
  r.department_org,
  r.estimated_attendance,
  r.short_notice_reason,
  s.name AS space_name,
  s.minimum_notice_hours,
  round(
    EXTRACT(epoch FROM (
      (r.event_date + coalesce(r.start_time, TIME '08:00'))
        AT TIME ZONE 'America/Chicago'
    ) - now()) / 3600.0,
    1
  ) AS hours_away,
  r.submitted_at
FROM event_requests r
LEFT JOIN spaces s ON s.id = r.space_id
WHERE r.short_notice
  AND r.short_notice_state = 'pending'
  AND r.status NOT IN ('cancelled', 'denied')
ORDER BY r.event_date, r.start_time;

-- A declined short-notice request stops there rather than sitting in
-- the queue looking like ordinary work.
CREATE OR REPLACE FUNCTION decline_short_notice(
  p_request_id uuid,
  p_user uuid,
  p_note text
) RETURNS void AS $fn$
BEGIN
  UPDATE event_requests
     SET short_notice_state = 'declined',
         short_notice_decided_at = now(),
         short_notice_decided_by = p_user,
         short_notice_note = p_note,
         status = 'denied',
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO request_status_history
    (request_id, from_status, to_status, changed_by, reason)
  VALUES
    (p_request_id, 'submitted', 'denied', p_user,
     'Short notice not approved');
END;
$fn$ LANGUAGE plpgsql;
