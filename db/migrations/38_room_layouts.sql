-- ============================================================
-- Migration 38 - Room layout diagrams
--
-- To-scale floor plans that staff draw and customers can see.
--
-- Everything is stored in feet. That is the unit the events office
-- and the rental companies already use, and converting at the edges
-- is less error-prone than storing pixels and hoping the scale
-- factor never changes.
--
-- A layout that is not dimensionally honest is worse than none:
-- someone plans around it and finds out on the day that eighteen
-- rounds do not fit.
-- ============================================================

ALTER TABLE spaces
  ADD COLUMN width_feet numeric(6,1),
  ADD COLUMN length_feet numeric(6,1),
  ADD COLUMN ceiling_feet numeric(4,1),
  ADD COLUMN layout_notes text;

COMMENT ON COLUMN spaces.width_feet IS
  'Usable floor width. Needed before a layout can be drawn to scale.';

-- Known dimensions for the rooms layouts are wanted for. These are
-- ESTIMATES derived from capacity and need checking with a tape
-- measure before anyone plans a wedding around them.
UPDATE spaces SET width_feet = 60, length_feet = 90, ceiling_feet = 18,
  layout_notes = 'PLACEHOLDER dimensions estimated from capacity. Measure before use.'
 WHERE name = 'Vermeer Banquet Room';

UPDATE spaces SET width_feet = 40, length_feet = 30, ceiling_feet = 12,
  layout_notes = 'PLACEHOLDER dimensions estimated from capacity. Measure before use.'
 WHERE name LIKE 'BMW Rooms- %' AND name NOT LIKE '%All three%'
   AND name NOT LIKE '%&%';

UPDATE spaces SET width_feet = 40, length_feet = 60, ceiling_feet = 12,
  layout_notes = 'PLACEHOLDER dimensions estimated from capacity. Measure before use.'
 WHERE name IN ('BMW Rooms- Weller & Moore', 'BMW Rooms- Moore & Boat');

UPDATE spaces SET width_feet = 40, length_feet = 90, ceiling_feet = 12,
  layout_notes = 'PLACEHOLDER dimensions estimated from capacity. Measure before use.'
 WHERE name = 'BMW Rooms- All three';

UPDATE spaces SET width_feet = 35, length_feet = 50, ceiling_feet = 11,
  layout_notes = 'PLACEHOLDER dimensions estimated from capacity. Measure before use.'
 WHERE name = 'Annex- Sutphen Room';

-- ------------------------------------------------------------
-- What can be placed in a room
--
-- A catalogue rather than hard-coded shapes, so the events office
-- can add a piece when they buy one without waiting for a developer.
-- ------------------------------------------------------------

CREATE TABLE layout_pieces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  label         text NOT NULL,
  category      text NOT NULL,
  shape         text NOT NULL CHECK (shape IN ('round', 'rect')),
  width_feet    numeric(5,2) NOT NULL,
  length_feet   numeric(5,2) NOT NULL,
  seats         integer NOT NULL DEFAULT 0,
  colour        text NOT NULL DEFAULT '#8A8577',
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true
);

INSERT INTO layout_pieces
  (code, label, category, shape, width_feet, length_feet, seats, colour, sort_order)
VALUES
  ('round60', '60 inch round', 'Tables', 'round', 5, 5, 8, '#B8A46B', 1),
  ('round72', '72 inch round', 'Tables', 'round', 6, 6, 10, '#B8A46B', 2),
  ('rect6',   '6 foot rectangle', 'Tables', 'rect', 6, 2.5, 6, '#B8A46B', 3),
  ('rect8',   '8 foot rectangle', 'Tables', 'rect', 8, 2.5, 8, '#B8A46B', 4),
  ('cocktail','Cocktail table', 'Tables', 'round', 2.5, 2.5, 0, '#C9B889', 5),

  ('head8',   'Head table, 8 foot', 'Special', 'rect', 8, 2.5, 4, '#8E2439', 10),
  ('sweet',   'Sweetheart table', 'Special', 'rect', 4, 2.5, 2, '#8E2439', 11),
  ('cake',    'Cake table', 'Special', 'rect', 4, 2.5, 0, '#8E2439', 12),
  ('gift',    'Gift table', 'Special', 'rect', 6, 2.5, 0, '#8E2439', 13),

  ('stage8',  'Stage section, 8x4', 'Staging', 'rect', 8, 4, 0, '#5A6B5D', 20),
  ('podium',  'Podium', 'Staging', 'rect', 2, 2, 0, '#5A6B5D', 21),
  ('dance12', 'Dance floor, 12x12', 'Staging', 'rect', 12, 12, 0, '#7D8B80', 22),
  ('dance16', 'Dance floor, 16x16', 'Staging', 'rect', 16, 16, 0, '#7D8B80', 23),

  ('buffet8', 'Buffet line, 8 foot', 'Service', 'rect', 8, 2.5, 0, '#4A5568', 30),
  ('bar6',    'Bar, 6 foot', 'Service', 'rect', 6, 2.5, 0, '#4A5568', 31),
  ('coffee',  'Coffee station', 'Service', 'rect', 4, 2.5, 0, '#4A5568', 32),
  ('reg',     'Registration table', 'Service', 'rect', 6, 2.5, 0, '#4A5568', 33),

  ('chairs10','Chair row, 10', 'Seating', 'rect', 18, 2, 10, '#9C9689', 40),
  ('screen',  'Screen', 'Equipment', 'rect', 8, 1, 0, '#3A3F44', 50),
  ('plant',   'Plant or decor', 'Equipment', 'round', 2, 2, 0, '#6B7F63', 51);

-- ------------------------------------------------------------
-- Layouts
--
-- A layout belongs to a space. It may also belong to an event, in
-- which case it is that event's plan; without one it is a reusable
-- template the office keeps.
-- ------------------------------------------------------------

CREATE TABLE layouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  request_id    uuid REFERENCES event_requests(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_template   boolean NOT NULL DEFAULT false,

  -- Shared with the requester. Until this is set the layout is a
  -- working draft and the customer cannot see it.
  shared_at     timestamptz,
  shared_by     uuid REFERENCES users(id),

  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (is_template = (request_id IS NULL))
);

CREATE INDEX ON layouts (space_id) WHERE is_template;
CREATE INDEX ON layouts (request_id);

CREATE TABLE layout_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id     uuid NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  piece_code    text NOT NULL REFERENCES layout_pieces(code),

  -- Position of the centre, in feet from the top left of the room.
  x_feet        numeric(6,2) NOT NULL,
  y_feet        numeric(6,2) NOT NULL,
  rotation      integer NOT NULL DEFAULT 0 CHECK (rotation BETWEEN 0 AND 359),
  label         text,
  seats_override integer CHECK (seats_override >= 0),
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE INDEX ON layout_items (layout_id, sort_order);

-- What a layout seats, computed rather than typed, so it cannot
-- disagree with what is actually drawn.
CREATE OR REPLACE FUNCTION layout_seats(p_layout uuid)
RETURNS integer AS $$
  SELECT coalesce(sum(coalesce(i.seats_override, p.seats)), 0)::integer
    FROM layout_items i
    JOIN layout_pieces p ON p.code = i.piece_code
   WHERE i.layout_id = p_layout;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION layout_touch()
RETURNS trigger AS $$
BEGIN
  UPDATE layouts SET updated_at = now()
   WHERE id = coalesce(NEW.layout_id, OLD.layout_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER layout_items_touch_layout
  AFTER INSERT OR UPDATE OR DELETE ON layout_items
  FOR EACH ROW EXECUTE FUNCTION layout_touch();

-- Rooms that can have layouts drawn: dimensions are the gate.
CREATE VIEW layoutable_spaces AS
SELECT id, name, building, width_feet, length_feet, ceiling_feet,
       capacity_seated, layout_notes
  FROM spaces
 WHERE is_active AND width_feet IS NOT NULL AND length_feet IS NOT NULL
 ORDER BY building, name;
