-- ============================================================
-- Migration 74 - What needs attention comes first
--
-- The queue was in date order, which is right for a diary and wrong
-- for a work list. An event in March that needs classifying today
-- matters more than one next week that is already settled.
--
-- So: the things waiting on the office first, then by how soon they
-- are, then everything else.
-- ============================================================

CREATE OR REPLACE FUNCTION queue_urgency(p_request_id uuid)
RETURNS TABLE (
  rank integer,
  reason text,
  waiting_days integer
) AS $fn$
  SELECT
    CASE
      -- Somebody asked for a room that was already gone and does not
      -- know it. Nothing else is worse than that.
      WHEN r.room_unavailable THEN 0

      -- Hours away and nobody has said whether it can happen.
      WHEN r.short_notice AND r.short_notice_state = 'pending' THEN 1

      -- The requester replied and is waiting.
      WHEN r.status = 'info_requested' THEN 2

      -- Submitted and not classified.
      WHEN cd.id IS NULL
           AND r.status NOT IN ('cancelled', 'denied', 'completed')
        THEN 3

      -- Classified, waiting on the capacity check.
      WHEN cd.id IS NOT NULL
           AND cc.id IS NULL
           AND r.status NOT IN ('cancelled', 'denied', 'completed')
        THEN 4

      -- Requester has confirmed and it needs a final look.
      WHEN r.status = 'pending_final_review' THEN 5

      -- Happened, not closed out.
      WHEN r.event_date < CURRENT_DATE
           AND r.status = 'confirmed' THEN 6

      -- Waiting on the requester, which is not our move.
      WHEN cd.id IS NOT NULL AND cd.acknowledged_at IS NULL THEN 7

      ELSE 8
    END,

    CASE
      WHEN r.room_unavailable THEN 'Room was already taken'
      WHEN r.short_notice AND r.short_notice_state = 'pending'
        THEN 'Short notice, needs a yes or no'
      WHEN r.status = 'info_requested' THEN 'They have replied'
      WHEN cd.id IS NULL
           AND r.status NOT IN ('cancelled', 'denied', 'completed')
        THEN 'Needs classifying'
      WHEN cd.id IS NOT NULL AND cc.id IS NULL
           AND r.status NOT IN ('cancelled', 'denied', 'completed')
        THEN 'Needs a capacity check'
      WHEN r.status = 'pending_final_review' THEN 'Needs a final look'
      WHEN r.event_date < CURRENT_DATE AND r.status = 'confirmed'
        THEN 'Needs closing out'
      WHEN cd.id IS NOT NULL AND cd.acknowledged_at IS NULL
        THEN 'Waiting on them'
      ELSE 'Nothing to do'
    END,

    greatest((CURRENT_DATE - r.submitted_at::date), 0)::int

  FROM event_requests r
  LEFT JOIN classification_decisions cd
         ON cd.request_id = r.id AND cd.is_current
  LEFT JOIN LATERAL (
    SELECT id FROM capacity_checks
     WHERE request_id = r.id
     ORDER BY checked_at DESC LIMIT 1
  ) cc ON true
  WHERE r.id = p_request_id;
$fn$ LANGUAGE sql STABLE;

-- The queue, in the order it should be worked.
CREATE OR REPLACE VIEW staff_queue AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  r.start_time,
  r.status::text,
  r.requester_name,
  r.department_org,
  coalesce(r.final_attendance, r.estimated_attendance) AS attendance,
  s.name AS space_name,
  cd.classification::text,
  r.short_notice,
  r.short_notice_state::text,
  r.room_unavailable,
  u.rank AS urgency,
  u.reason AS needs,
  u.waiting_days,
  (r.event_date - CURRENT_DATE)::int AS days_away,
  r.submitted_at
FROM event_requests r
LEFT JOIN spaces s ON s.id = r.space_id
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
CROSS JOIN LATERAL queue_urgency(r.id) u
WHERE r.status NOT IN ('draft')
ORDER BY
  u.rank,
  -- Within a band, soonest first: a thing happening Friday beats the
  -- same thing happening in March.
  r.event_date,
  r.submitted_at;
