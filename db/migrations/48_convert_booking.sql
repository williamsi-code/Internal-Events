-- ============================================================
-- Migration 48 - Turning a room hold into a catered event
--
-- An imported booking is a room and a time. A catered event needs a
-- requester, a classification, food sources and a headcount. The
-- conversion cannot invent any of that, so it creates the request in
-- submitted state with what is known and leaves the rest to be
-- filled in - by the customer if they have an account, or by staff
-- on their behalf.
--
-- The booking is kept rather than recreated, so the room never blinks
-- out of the schedule mid-conversion and its history survives.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN converted_from_booking_id uuid REFERENCES bookings(id),
  ADD COLUMN entered_by_staff boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN event_requests.entered_by_staff IS
  'Staff created this on someone behalf, so the classification answers are theirs rather than the requester''s. Worth knowing when reading a decision back.';

CREATE INDEX ON event_requests (converted_from_booking_id);

-- Bookings that could become catered events: imported or from a
-- recurring series, with no request behind them yet.
CREATE VIEW convertible_bookings AS
SELECT
  b.id,
  b.space_id,
  s.name AS space_name,
  s.building,
  b.title,
  b.note,
  b.external_ref,
  b.source_label,
  (b.event_starts_at AT TIME ZONE 'America/Chicago')::date AS event_date,
  to_char(b.event_starts_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS start_time,
  to_char(b.event_ends_at AT TIME ZONE 'America/Chicago', 'HH24:MI') AS end_time,
  b.import_batch_id IS NOT NULL AS from_import,
  b.series_id IS NOT NULL AS from_series
FROM bookings b
JOIN spaces s ON s.id = b.space_id
WHERE b.request_id IS NULL
  AND NOT b.is_blackout
  AND b.status <> 'released'
  AND (b.import_batch_id IS NOT NULL OR b.series_id IS NOT NULL);

-- Convert one booking.
--
-- Everything the request needs but the booking does not have is
-- passed in. The event type is left null deliberately: guessing it
-- from a spreadsheet title would produce a classification nobody
-- checked.
CREATE OR REPLACE FUNCTION convert_booking_to_event(
  p_booking_id   uuid,
  p_requester_id uuid,
  p_requester_name text,
  p_department   text,
  p_email        text,
  p_phone        text,
  p_attendance   integer,
  p_purpose      text,
  p_actor        uuid
) RETURNS uuid AS $fn$
DECLARE
  b record;
  v_request_id uuid;
BEGIN
  SELECT * INTO b FROM convertible_bookings WHERE id = p_booking_id;

  IF b IS NULL THEN
    RAISE EXCEPTION 'That booking cannot be converted. It may already have an event behind it.';
  END IF;

  INSERT INTO event_requests (
    requester_id, requester_name, department_org,
    contact_email, contact_phone,
    event_name, event_purpose, event_date,
    start_time, end_time, space_id,
    estimated_attendance, status, submitted_at,
    converted_from_booking_id, entered_by_staff
  ) VALUES (
    p_requester_id, p_requester_name, p_department,
    p_email, p_phone,
    b.title, p_purpose, b.event_date,
    b.start_time::time, b.end_time::time, b.space_id,
    p_attendance, 'submitted', now(),
    p_booking_id, true
  )
  RETURNING id INTO v_request_id;

  -- Blank rows so every later step has something to update, matching
  -- what the intake form would have created.
  INSERT INTO event_requirements (request_id) VALUES (v_request_id);

  INSERT INTO event_funding (request_id, financial_risk_bearer)
  VALUES (v_request_id, 'unclear');

  -- The classification answers are unknown, which is the honest
  -- state. Staff answer them or ask the requester to.
  INSERT INTO classification_answers (
    request_id, official_business, event_owner,
    primary_beneficiary, primary_payer, would_occur_without,
    requester_notes
  ) VALUES (
    v_request_id, 'unsure', 'unclear', 'unclear', 'unclear', 'unsure',
    'Converted from a room booking. The classification answers were not asked at the time.'
  );

  -- Food is not yet decided; without a row the details step has
  -- nothing to reason about.
  INSERT INTO event_food_sources (request_id, kind)
  VALUES (v_request_id, 'central_dining')
  ON CONFLICT DO NOTHING;

  -- Attach the existing booking rather than making a new one, so the
  -- room never blinks out of the schedule.
  UPDATE bookings
     SET request_id = v_request_id,
         title = b.title,
         note = coalesce(note, '') ||
                CASE WHEN note IS NULL THEN '' ELSE ' ' END ||
                'Converted to a catered event.'
   WHERE id = p_booking_id;

  INSERT INTO request_status_history
    (request_id, from_status, to_status, changed_by, reason)
  VALUES
    (v_request_id, 'draft', 'submitted', p_actor,
     'Converted from an existing room booking');

  RETURN v_request_id;
END;
$fn$ LANGUAGE plpgsql;

-- Events that came in this way and still have unanswered
-- classification questions. Staff need to see these; a converted
-- event with 'unclear' everywhere would otherwise classify itself as
-- needing review forever without anyone knowing why.
CREATE VIEW converted_awaiting_answers AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  r.requester_name,
  r.department_org,
  s.name AS space_name,
  (EXTRACT(day FROM now() - r.submitted_at))::int AS days_since
FROM event_requests r
LEFT JOIN spaces s ON s.id = r.space_id
JOIN classification_answers ca ON ca.request_id = r.id
WHERE r.converted_from_booking_id IS NOT NULL
  AND r.status IN ('submitted', 'under_review', 'info_requested')
  AND ca.event_owner = 'unclear'
ORDER BY r.event_date;
