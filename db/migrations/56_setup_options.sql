-- ============================================================
-- Migration 56 - Setup, equipment and technology as checklists
--
-- These were three free text boxes. A requester wrote "rounds of 8
-- please" or "round tables" or "8 tops" and someone in the office
-- worked out what they meant. The kitchen and the setup crew then
-- worked it out again from the same prose.
--
-- A checklist per room fixes both ends: the requester picks from
-- what the room can actually do, and the catering sheet prints a
-- list rather than a paragraph.
--
-- What each room offers is editable in the back office, because the
-- rooms differ and the office knows how.
-- ============================================================

CREATE TYPE setup_option_kind AS ENUM ('setup', 'equipment', 'technology');

CREATE TABLE setup_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        setup_option_kind NOT NULL,
  label       text NOT NULL,
  help_text   text,
  -- Some options need a number: how many rounds, how many mics.
  takes_count boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (kind, label)
);

INSERT INTO setup_options (kind, label, help_text, takes_count, sort_order) VALUES
  ('setup', 'Rounds of 6', 'Round tables seating six', true, 1),
  ('setup', 'Rounds of 8', 'Round tables seating eight', true, 2),
  ('setup', 'Theater seating', 'Chairs in rows facing the front', false, 3),
  ('setup', 'Classroom seating', 'Tables in rows facing the front', false, 4),
  ('setup', 'Standing', 'No seating, or seating around the edges', false, 5),
  ('setup', 'High top tables', 'Tall tables for standing', true, 6),

  ('equipment', 'Tables', 'Beyond those in the seating plan', true, 1),
  ('equipment', 'Stage', NULL, false, 2),
  ('equipment', 'Podium', NULL, false, 3),

  ('technology', 'Projection', 'Screen and projector', false, 1),
  ('technology', 'Microphones', NULL, true, 2),
  ('technology', 'Livestream', 'Recording or streaming the event', false, 3);

-- ------------------------------------------------------------
-- What each room offers
--
-- Absence means the room does not offer it. A room with no rows at
-- all is treated as offering everything, so nothing breaks before
-- the office has been through them.
-- ------------------------------------------------------------

CREATE TABLE space_setup_options (
  space_id  uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES setup_options(id) ON DELETE CASCADE,
  -- The most this room can take. Null means no stated limit.
  max_count integer,
  note      text,
  PRIMARY KEY (space_id, option_id)
);

CREATE INDEX ON space_setup_options (space_id);

-- Every active room starts offering everything, so the form works
-- immediately. The office narrows it room by room.
INSERT INTO space_setup_options (space_id, option_id)
SELECT s.id, o.id
  FROM spaces s
  CROSS JOIN setup_options o
 WHERE s.is_active;

-- Rooms too small for rounds, and outdoor spaces without power.
DELETE FROM space_setup_options sso
 USING spaces s, setup_options o
 WHERE sso.space_id = s.id AND sso.option_id = o.id
   AND o.kind = 'setup'
   AND o.label IN ('Rounds of 6', 'Rounds of 8')
   AND coalesce(s.capacity_seated, 0) < 24;

DELETE FROM space_setup_options sso
 USING spaces s, setup_options o
 WHERE sso.space_id = s.id AND sso.option_id = o.id
   AND o.kind = 'technology'
   AND s.category = 'Outside Spaces';

DELETE FROM space_setup_options sso
 USING spaces s, setup_options o
 WHERE sso.space_id = s.id AND sso.option_id = o.id
   AND o.kind = 'equipment'
   AND o.label = 'Stage'
   AND coalesce(s.capacity_seated, 0) < 80;

-- ------------------------------------------------------------
-- What a request asked for
-- ------------------------------------------------------------

CREATE TABLE request_setup_selections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES setup_options(id),
  count       integer CHECK (count IS NULL OR count > 0),
  note        text,
  UNIQUE (request_id, option_id)
);

CREATE INDEX ON request_setup_selections (request_id);

-- What a room can do, for the form.
CREATE OR REPLACE FUNCTION options_for_space(p_space_id uuid)
RETURNS TABLE (
  id uuid,
  kind text,
  label text,
  help_text text,
  takes_count boolean,
  max_count integer,
  sort_order integer
) AS $fn$
  SELECT o.id, o.kind::text, o.label, o.help_text, o.takes_count,
         sso.max_count, o.sort_order
    FROM setup_options o
    LEFT JOIN space_setup_options sso
           ON sso.option_id = o.id AND sso.space_id = p_space_id
   WHERE o.is_active
     AND (
       sso.space_id IS NOT NULL
       -- A room nobody has configured offers everything.
       OR NOT EXISTS (
         SELECT 1 FROM space_setup_options x WHERE x.space_id = p_space_id
       )
     )
   ORDER BY o.kind, o.sort_order;
$fn$ LANGUAGE sql STABLE;

-- What was asked for, in a form the catering sheet can print.
CREATE OR REPLACE FUNCTION setup_for_request(p_request_id uuid)
RETURNS TABLE (kind text, label text, count integer, note text) AS $fn$
  SELECT o.kind::text, o.label, rss.count, rss.note
    FROM request_setup_selections rss
    JOIN setup_options o ON o.id = rss.option_id
   WHERE rss.request_id = p_request_id
   ORDER BY o.kind, o.sort_order;
$fn$ LANGUAGE sql STABLE;
