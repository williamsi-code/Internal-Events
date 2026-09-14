-- ============================================================
-- Migration 52 - Referring a declined event to a caterer
--
-- A decline currently records that business was sent away, which
-- serves the quarterly report and nobody else. The customer is told
-- we cannot do it and left to find their own way.
--
-- Naming the caterers we would trust is a better answer, costs
-- nothing, and is the reason the approved list exists. It also keeps
-- the event on campus - the room booking survives even when the
-- catering does not.
-- ============================================================

CREATE TABLE caterer_referrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  caterer_id    uuid REFERENCES caterers(id) ON DELETE SET NULL,
  -- A caterer we recommended who is not on the approved list, named
  -- rather than linked. Rare, but it happens.
  caterer_other text,
  referred_at   timestamptz NOT NULL DEFAULT now(),
  referred_by   uuid REFERENCES users(id),

  CHECK (caterer_id IS NOT NULL OR caterer_other IS NOT NULL)
);

CREATE INDEX ON caterer_referrals (request_id);
CREATE INDEX ON caterer_referrals (caterer_id);

-- What a declined event was told, for the requester's page.
CREATE OR REPLACE FUNCTION referrals_for(p_request_id uuid)
RETURNS TABLE (
  id uuid,
  caterer_id uuid,
  name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  speciality text,
  is_approved boolean
) AS $fn$
  SELECT cr.id,
         cr.caterer_id,
         coalesce(oc.business_name, cr.caterer_other),
         oc.contact_name,
         oc.contact_email::text,
         oc.contact_phone,
         oc.website,
         oc.cuisine_notes,
         (oc.id IS NOT NULL AND oc.status = 'approved')
    FROM caterer_referrals cr
    LEFT JOIN caterers oc ON oc.id = cr.caterer_id
   WHERE cr.request_id = p_request_id
   ORDER BY cr.referred_at;
$fn$ LANGUAGE sql STABLE;

-- Which caterers have been sent work, and how often. The events
-- office should know whether it is recommending the same firm every
-- time, and the caterers themselves will ask.
CREATE OR REPLACE VIEW caterer_referral_counts AS
SELECT
  oc.id,
  oc.business_name,
  oc.status::text,
  count(cr.id) AS referrals,
  count(cr.id) FILTER (
    WHERE cr.referred_at > now() - INTERVAL '1 year'
  ) AS referrals_this_year,
  to_char(max(cr.referred_at), 'Mon FMDD, YYYY') AS last_referred
FROM caterers oc
LEFT JOIN caterer_referrals cr ON cr.caterer_id = oc.id
GROUP BY oc.id, oc.business_name, oc.status
ORDER BY count(cr.id) DESC, oc.business_name;

-- A declined event may still keep its room.
ALTER TABLE event_requests
  ADD COLUMN keeps_room_after_decline boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN event_requests.keeps_room_after_decline IS
  'The catering was declined but the room booking stands. The event goes ahead with an outside caterer.';
