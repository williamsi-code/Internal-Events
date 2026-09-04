-- ============================================================
-- Migration 43 - Subscribable calendar feeds
--
-- A read-only .ics URL people can add to Outlook, so security and
-- facilities see what is happening without signing in to anything.
--
-- Feeds are unauthenticated by necessity: Outlook fetches them with
-- no credentials. Security therefore rests on the URL being
-- unguessable, which is the standard pattern and worth being
-- deliberate about - anyone with the link sees the bookings. A feed
-- can be revoked, which is what makes that acceptable.
--
-- Refresh is Outlook's decision, often a few hours. Fine for "what
-- is on this week", not for "something changed this morning".
-- ============================================================

CREATE TYPE feed_scope AS ENUM ('all', 'building', 'space', 'category');

CREATE TABLE calendar_feeds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What goes in the URL. Long and random because it is the only
  -- thing standing between a link and the schedule.
  token         text UNIQUE NOT NULL
                  DEFAULT encode(gen_random_bytes(24), 'hex'),

  label         text NOT NULL,
  scope         feed_scope NOT NULL,
  building      text,
  space_id      uuid REFERENCES spaces(id) ON DELETE CASCADE,
  category      text,

  -- Whether the feed names the event or just says the room is busy.
  -- A facilities feed rarely needs to know it is the Anderson
  -- wedding; it needs to know the room is occupied.
  show_details  boolean NOT NULL DEFAULT true,
  include_tentative boolean NOT NULL DEFAULT true,

  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_fetched_at timestamptz,
  fetch_count   integer NOT NULL DEFAULT 0,

  CHECK (scope <> 'building' OR building IS NOT NULL),
  CHECK (scope <> 'space' OR space_id IS NOT NULL),
  CHECK (scope <> 'category' OR category IS NOT NULL)
);

CREATE INDEX ON calendar_feeds (token) WHERE is_active;

-- One to start from, covering everything. Narrower feeds are made
-- in the back office.
INSERT INTO calendar_feeds (label, scope, show_details)
VALUES ('All campus events', 'all', true);

-- What a feed should contain. Kept in SQL so the feed and the
-- scheduler cannot disagree about which bookings exist.
CREATE OR REPLACE FUNCTION feed_bookings(p_token text)
RETURNS TABLE (
  id uuid,
  title text,
  space_name text,
  building text,
  starts_at timestamptz,
  ends_at timestamptz,
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  status text,
  is_blackout boolean,
  note text,
  attendance integer,
  reference_code text,
  updated_at timestamptz
) AS $$
  SELECT b.id, b.title, s.name, s.building,
         b.starts_at, b.ends_at, b.event_starts_at, b.event_ends_at,
         b.status::text, b.is_blackout, b.note,
         coalesce(r.final_attendance, r.estimated_attendance),
         r.reference_code,
         b.updated_at
    FROM calendar_feeds f
    JOIN bookings b ON true
    JOIN spaces s ON s.id = b.space_id
    LEFT JOIN event_requests r ON r.id = b.request_id
   WHERE f.token = p_token
     AND f.is_active
     AND b.status <> 'released'
     AND (f.include_tentative OR b.status = 'confirmed')
     -- A year back and two forward. Outlook does not want the whole
     -- history, and a feed that grows forever eventually times out.
     AND b.starts_at > now() - INTERVAL '1 year'
     AND b.starts_at < now() + INTERVAL '2 years'
     AND CASE f.scope
           WHEN 'all'      THEN true
           WHEN 'building' THEN s.building = f.building
           WHEN 'space'    THEN s.id = f.space_id
           WHEN 'category' THEN s.category = f.category
         END
   ORDER BY b.starts_at;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION feed_settings(p_token text)
RETURNS TABLE (label text, show_details boolean) AS $$
  SELECT label, show_details FROM calendar_feeds
   WHERE token = p_token AND is_active;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION record_feed_fetch(p_token text)
RETURNS void AS $$
  UPDATE calendar_feeds
     SET last_fetched_at = now(), fetch_count = fetch_count + 1
   WHERE token = p_token;
$$ LANGUAGE sql;
