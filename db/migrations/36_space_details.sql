-- ============================================================
-- Migration 36 - Space detail pages
--
-- A row in a table tells an outside customer almost nothing. Before
-- someone books a room for a wedding they want to see it, know what
-- it seats laid out three different ways, and find out whether there
-- is somewhere to put a band.
--
-- Photographs get their own table rather than a column, because a
-- room needs several and they need an order and a caption.
-- ============================================================

ALTER TABLE spaces
  ADD COLUMN slug text UNIQUE,
  ADD COLUMN tagline text,
  ADD COLUMN long_description text,
  ADD COLUMN features text,          -- one per line
  ADD COLUMN setup_options text,     -- one per line: "Rounds of 8 - 180"
  ADD COLUMN good_for text,          -- one per line
  ADD COLUMN accessibility_notes text,
  ADD COLUMN nearby_parking text,
  ADD COLUMN hero_media_id uuid REFERENCES media(id) ON DELETE SET NULL,
  ADD COLUMN floorplan_media_id uuid REFERENCES media(id) ON DELETE SET NULL;

-- Readable URLs from the room name. Collisions get the id appended,
-- which is ugly but unique and only affects duplicates.
UPDATE spaces
   SET slug = regexp_replace(
                lower(trim(coalesce(building, '') || '-' || name)),
                '[^a-z0-9]+', '-', 'g'
              );

UPDATE spaces s
   SET slug = s.slug || '-' || substring(s.id::text, 1, 6)
 WHERE EXISTS (
   SELECT 1 FROM spaces o
    WHERE o.slug = s.slug AND o.id <> s.id
 );

UPDATE spaces SET slug = trim(both '-' from slug);

CREATE INDEX ON spaces (slug);

CREATE TABLE space_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  media_id    uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  caption     text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, media_id)
);

CREATE INDEX ON space_media (space_id, sort_order);

-- Seed the three public buildings with something better than a blank
-- page. PLACEHOLDER text, but the shape is right and it shows the
-- events office what each field is for.
UPDATE spaces SET
  tagline = 'PLACEHOLDER: one line describing the room',
  long_description = 'PLACEHOLDER: replace this. Two or three sentences about what the room is like, what it is best suited to, and anything that makes it particular. Written for someone who has never been on campus.',
  setup_options = 'Rounds of eight
Theatre
Classroom
Standing reception',
  good_for = 'Receptions
Dinners
Meetings',
  features = 'Adjustable lighting
Sound system
Projector and screen
Climate controlled'
WHERE externally_bookable AND is_active;

-- Rooms with real capacity get a more useful setup line.
UPDATE spaces SET
  setup_options = 'Rounds of eight - ' || capacity_seated || E'\nTheatre - ' ||
                  round(capacity_seated * 1.2) || E'\nClassroom - ' ||
                  round(capacity_seated * 0.6) || E'\nStanding reception - ' ||
                  coalesce(capacity_standing, round(capacity_seated * 1.4))
WHERE externally_bookable AND is_active AND capacity_seated > 0;
