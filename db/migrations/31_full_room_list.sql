-- ============================================================
-- Migration 31 - The full room list
--
-- 172 rooms in four layers: campus, category, building, room.
-- The spaces table previously had only building and name, so this
-- adds the two outer layers rather than flattening them into the
-- building name.
--
-- Placeholder spaces are deactivated, not deleted. Any test event
-- that booked one keeps a working record.
--
-- FACILITY RATES ARE ZERO for every room here. The earlier
-- placeholder rates were invented by capacity and would be wrong
-- for a real room list. Set them in Back office - Event spaces for
-- any room genuinely rented to outside customers.
-- ============================================================

ALTER TABLE spaces
  ADD COLUMN campus text NOT NULL DEFAULT 'Central College',
  ADD COLUMN category text;

CREATE INDEX ON spaces (category, building) WHERE is_active;

-- Retire the placeholders.
UPDATE spaces SET is_active = false;

INSERT INTO spaces (
  campus, category, building, name,
  capacity_seated, supports_catering, sort_order,
  is_active,
  facility_rate_internal, facility_rate_affiliated, facility_rate_external
)
SELECT v.campus, v.category, v.building, v.name,
       v.seated, v.catering, v.ord,
       true, 0, 0, 0
FROM (VALUES
  ('Central College','Academic','Central Hall','308',44,true,1),
  ('Central College','Academic','Central Hall','310',35,true,2),
  ('Central College','Academic','Central Hall','313',35,true,3),
  ('Central College','Academic','Central Hall','316',12,true,4),
  ('Central College','Academic','Central Hall','317',16,true,5),
  ('Central College','Academic','Central Hall','Douwstra Auditorium',645,true,6),
  ('Central College','Academic','Central Hall','Douwstra Lobby',40,true,7),
  ('Central College','Academic','Central Hall','Green Room',10,true,8),
  ('Central College','Academic','Central Hall','Wormhoudt Room',12,true,9),
  ('Central College','Academic','Cox Snow Music','106',8,true,10),
  ('Central College','Academic','Cox Snow Music','110',25,true,11),
  ('Central College','Academic','Cox Snow Music','111',12,true,12),
  ('Central College','Academic','Cox Snow Music','112',6,true,13),
  ('Central College','Academic','Cox Snow Music','207',2,true,14),
  ('Central College','Academic','Cox Snow Music','220',2,true,15),
  ('Central College','Academic','Cox Snow Music','Lounge',12,true,16),
  ('Central College','Academic','Cox Snow Music','Recital Hall',205,true,17),
  ('Central College','Academic','Cox Snow Music','Rehearsal Hall',50,true,18),
  ('Central College','Academic','Garden Cottage','Central College Garden',NULL,true,19),
  ('Central College','Academic','Garden Cottage','Lower Level',NULL,true,20),
  ('Central College','Academic','Garden Cottage','Outdoor Classroom',NULL,true,21),
  ('Central College','Academic','Garden Cottage','Teaching Kitchen',20,true,22),
  ('Central College','Academic','Geisler Library','99',20,true,23),
  ('Central College','Academic','Geisler Library','202',28,true,24),
  ('Central College','Academic','Geisler Library','Collaboration Center',22,true,25),
  ('Central College','Academic','Geisler Library','Geisler 268 Conference Room',12,true,26),
  ('Central College','Academic','Geisler Library','GEL Common Area',25,true,27),
  ('Central College','Academic','Geisler Library','Library Patio',25,true,28),
  ('Central College','Academic','Geisler Library','Reference Teaching Area',16,true,29),
  ('Central College','Academic','Geisler Library','The Café',20,true,30),
  ('Central College','Academic','Helen Jean Hislop Center','101',30,true,31),
  ('Central College','Academic','Helen Jean Hislop Center','102',36,true,32),
  ('Central College','Academic','Helen Jean Hislop Center','103',30,true,33),
  ('Central College','Academic','Helen Jean Hislop Center','104',40,true,34),
  ('Central College','Academic','Helen Jean Hislop Center','113',6,true,35),
  ('Central College','Academic','Helen Jean Hislop Center','114',16,true,36),
  ('Central College','Academic','Helen Jean Hislop Center','123',8,true,37),
  ('Central College','Academic','Helen Jean Hislop Center','130',20,true,38),
  ('Central College','Academic','Kruidenier Center','112',30,true,39),
  ('Central College','Academic','Kruidenier Center','114',14,true,40),
  ('Central College','Academic','Kruidenier Center','Kruidenier Make Up Area',10,true,41),
  ('Central College','Academic','Kruidenier Center','Large Theater- KC120',205,true,42),
  ('Central College','Academic','Kruidenier Center','Small Theater- KC133',50,true,43),
  ('Central College','Academic','Lubbers','103',20,true,44),
  ('Central College','Academic','Lubbers','125',22,true,45),
  ('Central College','Academic','Lubbers','126',16,true,46),
  ('Central College','Academic','Lubbers','15',14,true,47),
  ('Central College','Academic','Lubbers','19',16,true,48),
  ('Central College','Academic','Lubbers','239',12,true,49),
  ('Central College','Academic','Lubbers','27',20,true,50),
  ('Central College','Academic','Lubbers','Glass Blowing Studio',10,true,51),
  ('Central College','Academic','Lubbers','Mills Gallery',50,true,52),
  ('Central College','Academic','Roe Center','127',NULL,true,53),
  ('Central College','Academic','Roe Center','130',20,true,54),
  ('Central College','Academic','Roe Center','135',10,true,55),
  ('Central College','Academic','Roe Center','137',28,true,56),
  ('Central College','Academic','Roe Center','138',28,true,57),
  ('Central College','Academic','Roe Center','145',40,true,58),
  ('Central College','Academic','Roe Center','1st Floor Lobby',75,true,59),
  ('Central College','Academic','Roe Center','221',28,true,60),
  ('Central College','Academic','Roe Center','227A Conference Room',8,true,61),
  ('Central College','Academic','Roe Center','230',28,true,62),
  ('Central College','Academic','Roe Center','233 South IR',6,true,63),
  ('Central College','Academic','Roe Center','235 North IR',6,true,64),
  ('Central College','Academic','Roe Center','237',24,true,65),
  ('Central College','Academic','Roe Center','238',30,true,66),
  ('Central College','Academic','Roe Center','245',40,true,67),
  ('Central College','Academic','Roe Center','2nd Floor Lobby',75,true,68),
  ('Central College','Academic','Roe Center','321',28,true,69),
  ('Central College','Academic','Roe Center','330',28,true,70),
  ('Central College','Academic','Roe Center','338',30,true,71),
  ('Central College','Academic','Roe Center','345',40,true,72),
  ('Central College','Academic','Roe Center','3rd Floor Lobby',75,true,73),
  ('Central College','Academic','Roe Center','Farver Reading Room',33,true,74),
  ('Central College','Academic','Roe Center','Psych Office Ste 2nd',25,true,75),
  ('Central College','Academic','Roe Center','Roe Center Patio, SW Ent',30,true,76),
  ('Central College','Academic','Roe Center','Roe Center Roof',50,true,77),
  ('Central College','Academic','Vermeer Science Center','141',36,true,78),
  ('Central College','Academic','Vermeer Science Center','143',24,true,79),
  ('Central College','Academic','Vermeer Science Center','161',15,true,80),
  ('Central College','Academic','Vermeer Science Center','163',30,true,81),
  ('Central College','Academic','Vermeer Science Center','164',12,true,82),
  ('Central College','Academic','Vermeer Science Center','165',30,true,83),
  ('Central College','Academic','Vermeer Science Center','166',30,true,84),
  ('Central College','Academic','Vermeer Science Center','170',16,true,85),
  ('Central College','Academic','Vermeer Science Center','173',16,true,86),
  ('Central College','Academic','Vermeer Science Center','180',100,true,87),
  ('Central College','Academic','Vermeer Science Center','180 Atrium',50,true,88),
  ('Central College','Academic','Vermeer Science Center','183',16,true,89),
  ('Central College','Academic','Vermeer Science Center','184',24,true,90),
  ('Central College','Academic','Vermeer Science Center','187',24,true,91),
  ('Central College','Academic','Vermeer Science Center','189',24,true,92),
  ('Central College','Academic','Vermeer Science Center','1st Floor E.Student Lnge',15,true,93),
  ('Central College','Academic','Vermeer Science Center','240',14,true,94),
  ('Central College','Academic','Vermeer Science Center','241',30,true,95),
  ('Central College','Academic','Vermeer Science Center','243',24,true,96),
  ('Central College','Academic','Vermeer Science Center','245',10,true,97),
  ('Central College','Academic','Vermeer Science Center','246',24,true,98),
  ('Central College','Academic','Vermeer Science Center','263',80,true,99),
  ('Central College','Academic','Vermeer Science Center','269',40,true,100),
  ('Central College','Academic','Vermeer Science Center','271',10,true,101),
  ('Central College','Academic','Vermeer Science Center','280',16,true,102),
  ('Central College','Academic','Vermeer Science Center','282',24,true,103),
  ('Central College','Academic','Vermeer Science Center','284',24,true,104),
  ('Central College','Academic','Vermeer Science Center','286',24,true,105),
  ('Central College','Academic','Vermeer Science Center','288',24,true,106),
  ('Central College','Academic','Vermeer Science Center','VSC Patio',100,true,107),
  ('Central College','Academic','Vermeer Science Center','VSC Resource Library',4,true,108),
  ('Central College','Academic','Weller Center Building','101',40,true,109),
  ('Central College','Academic','Weller Center Building','102',28,true,110),
  ('Central College','Academic','Weller Center Building','103',30,true,111),
  ('Central College','Academic','Weller Center Building','135',15,true,112),
  ('Central College','Academic','Weller Center Building','201',30,true,113),
  ('Central College','Academic','Weller Center Building','202',32,true,114),
  ('Central College','Academic','Weller Center Building','203',31,true,115),
  ('Central College','Academic','Weller Center Building','208',10,true,116),
  ('Central College','Academic','Weller Center Building','225',32,true,117),
  ('Central College','Academic','Weller Center Building','226',10,true,118),
  ('Central College','Academic','Weller Center Building','228',24,true,119),
  ('Central College','Academic','Weller Center Building','230- Office Lounge',10,true,120),
  ('Central College','Academic','Weller Center Building','Atrium',100,true,121),
  ('Central College','Athletics','Kuyper Athletics Complex','2104',10,true,122),
  ('Central College','Athletics','Kuyper Athletics Complex','2107',58,true,123),
  ('Central College','Athletics','Kuyper Athletics Complex','2108',40,true,124),
  ('Central College','Athletics','Kuyper Athletics Complex','2109',30,true,125),
  ('Central College','Athletics','Kuyper Athletics Complex','Kuyper Fieldhouse',3000,true,126),
  ('Central College','Athletics','Kuyper Athletics Complex','Kuyper Gym',2700,true,127),
  ('Central College','Athletics','Kuyper Athletics Complex','Multipurpose/Aerobic',75,true,128),
  ('Central College','Athletics','Kuyper Athletics Complex','Pacha Family Lobby',200,true,129),
  ('Central College','Meeting Venues','Central Market','104 Side Room',32,true,130),
  ('Central College','Meeting Venues','Central Market','105 Side Room',32,true,131),
  ('Central College','Meeting Venues','Central Market','106 Side Room',32,true,132),
  ('Central College','Meeting Venues','Central Market','108 Side Room',32,true,133),
  ('Central College','Meeting Venues','Central Market','Lower Level Dining Area',70,true,134),
  ('Central College','Meeting Venues','Central Market','Main Dining Area',1000,true,135),
  ('Central College','Meeting Venues','Central Market','President''s Dining Room',40,true,136),
  ('Central College','Meeting Venues','Chapel','Lower Chapel',70,true,137),
  ('Central College','Meeting Venues','Chapel','Stepanske Amphitheater',250,true,138),
  ('Central College','Meeting Venues','Chapel','Upper Chapel',225,true,139),
  ('Central College','Meeting Venues','Graham Conference Center','Annex R/N Boardroom',18,true,140),
  ('Central College','Meeting Venues','Graham Conference Center','Annex- Sutphen Room',150,true,141),
  ('Central College','Meeting Venues','Graham Conference Center','Bornt Plaza',500,true,142),
  ('Central College','Meeting Venues','Graham Conference Center','Burnsting Lounge',25,true,143),
  ('Central College','Meeting Venues','Graham Conference Center','Conference Room 1- Paul Poppen',116,true,144),
  ('Central College','Meeting Venues','Graham Conference Center','Conference Room 2',36,true,145),
  ('Central College','Meeting Venues','Graham Conference Center','Formal Lounge',50,true,146),
  ('Central College','Meeting Venues','Graham Conference Center','Simmelink Atrium',200,true,147),
  ('Central College','Meeting Venues','Graham Conference Center','Vermeer Banquest Room',400,true,148),
  ('Central College','Meeting Venues','Maytag Student Center','2nd Floor Gallery',100,true,149),
  ('Central College','Meeting Venues','Maytag Student Center','Atrium 1',100,true,150),
  ('Central College','Meeting Venues','Maytag Student Center','BMW Rooms- Boat',85,true,151),
  ('Central College','Meeting Venues','Maytag Student Center','BMW Rooms- Weller',85,true,152),
  ('Central College','Meeting Venues','Maytag Student Center','BMW Rooms- Moore',77,true,153),
  ('Central College','Meeting Venues','Maytag Student Center','BMW Rooms- Weller & Moore',162,true,154),
  ('Central College','Meeting Venues','Maytag Student Center','BMW Rooms- Moore & Boat',162,true,155),
  ('Central College','Meeting Venues','Maytag Student Center','BMW Rooms- All three',175,true,156),
  ('Central College','Meeting Venues','Maytag Student Center','Corridor',100,true,157),
  ('Central College','Meeting Venues','Maytag Student Center','Fred''s',89,true,158),
  ('Central College','Meeting Venues','Maytag Student Center','Fred''s Patio',40,true,159),
  ('Central College','Meeting Venues','Maytag Student Center','Hinga Room',8,true,160),
  ('Central College','Meeting Venues','Maytag Student Center','Maytag Fitness Center',60,true,161),
  ('Central College','Meeting Venues','Maytag Student Center','Van Emmerik Studio',140,true,162),
  ('Central College','Outside Spaces','Outside Spaces','Big Island',25,true,163),
  ('Central College','Outside Spaces','Outside Spaces','Bonfire Pit',100,true,164),
  ('Central College','Outside Spaces','Outside Spaces','Central Market Patio',150,true,165),
  ('Central College','Outside Spaces','Outside Spaces','Library North Lawn',500,true,166),
  ('Central College','Outside Spaces','Outside Spaces','Maytag Lawn & Broadway',150,true,167),
  ('Central College','Outside Spaces','Outside Spaces','Peace Hall B-Ball Court',500,true,168),
  ('Central College','Outside Spaces','Outside Spaces','Peace Mall',1000,true,169),
  ('Central College','Outside Spaces','Outside Spaces','Schipper Fitness Lawn',250,true,170),
  ('Central College','Outside Spaces','Outside Spaces','Scholte Outdoor Patio',50,true,171),
  ('Central College','Outside Spaces','Outside Spaces','Weller- South Lawn',200,true,172)) AS v(campus, category, building, name, seated, catering, ord);

-- ------------------------------------------------------------
-- Combinable rooms
--
-- The BMW Rooms divide and combine: booking all three must block
-- each part, and booking a part must block the whole. The exclusion
-- constraint on bookings compares space_id, so it cannot see this
-- on its own - two different rooms look like no conflict even when
-- they are the same four walls.
--
-- This records which spaces physically overlap, and a trigger
-- refuses a confirmed booking that collides with one.
-- ------------------------------------------------------------

CREATE TABLE space_overlaps (
  space_id       uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  overlaps_with  uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  note           text,
  PRIMARY KEY (space_id, overlaps_with),
  CHECK (space_id <> overlaps_with)
);

-- Declared one way and stored both ways, so a lookup never has to
-- check two directions.
CREATE OR REPLACE FUNCTION declare_overlap(a text, b text, why text)
RETURNS void AS $$
DECLARE
  id_a uuid;
  id_b uuid;
BEGIN
  SELECT id INTO id_a FROM spaces WHERE name = a AND is_active LIMIT 1;
  SELECT id INTO id_b FROM spaces WHERE name = b AND is_active LIMIT 1;
  IF id_a IS NULL OR id_b IS NULL THEN
    RAISE NOTICE 'Could not link % and %', a, b;
    RETURN;
  END IF;
  INSERT INTO space_overlaps (space_id, overlaps_with, note)
  VALUES (id_a, id_b, why), (id_b, id_a, why)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

SELECT declare_overlap('BMW Rooms- All three', 'BMW Rooms- Boat', 'Boat is part of all three');
SELECT declare_overlap('BMW Rooms- All three', 'BMW Rooms- Weller', 'Weller is part of all three');
SELECT declare_overlap('BMW Rooms- All three', 'BMW Rooms- Moore', 'Moore is part of all three');
SELECT declare_overlap('BMW Rooms- All three', 'BMW Rooms- Weller & Moore', 'Contained within all three');
SELECT declare_overlap('BMW Rooms- All three', 'BMW Rooms- Moore & Boat', 'Contained within all three');
SELECT declare_overlap('BMW Rooms- Weller & Moore', 'BMW Rooms- Weller', 'Weller is part of this pair');
SELECT declare_overlap('BMW Rooms- Weller & Moore', 'BMW Rooms- Moore', 'Moore is part of this pair');
SELECT declare_overlap('BMW Rooms- Moore & Boat', 'BMW Rooms- Moore', 'Moore is part of this pair');
SELECT declare_overlap('BMW Rooms- Moore & Boat', 'BMW Rooms- Boat', 'Boat is part of this pair');
SELECT declare_overlap('BMW Rooms- Weller & Moore', 'BMW Rooms- Moore & Boat', 'Both include Moore');

-- ------------------------------------------------------------
-- Refuse a confirmed booking that collides with an overlapping room
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_overlapping_spaces()
RETURNS trigger AS $$
DECLARE
  clash record;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT b.title, s.name INTO clash
    FROM space_overlaps o
    JOIN bookings b ON b.space_id = o.overlaps_with
    JOIN spaces s ON s.id = o.overlaps_with
   WHERE o.space_id = NEW.space_id
     AND b.status = 'confirmed'
     AND b.id <> NEW.id
     AND tstzrange(b.starts_at, b.ends_at)
         && tstzrange(NEW.starts_at, NEW.ends_at)
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'That room shares space with %, which is already confirmed for "%" at this time',
      clash.name, clash.title;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_respect_overlaps
  BEFORE INSERT OR UPDATE OF status, starts_at, ends_at, space_id
  ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_overlapping_spaces();

-- Surface overlapping-room clashes alongside same-room ones.
CREATE OR REPLACE VIEW booking_conflicts AS
SELECT
  a.id            AS booking_id,
  a.request_id,
  a.title,
  a.status,
  a.starts_at,
  a.ends_at,
  s.name          AS space_name,
  s.building,
  b.id            AS other_booking_id,
  b.request_id    AS other_request_id,
  b.title         AS other_title,
  b.status        AS other_status
FROM bookings a
JOIN bookings b
  ON a.id <> b.id
 AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
 AND (
   a.space_id = b.space_id
   OR EXISTS (
     SELECT 1 FROM space_overlaps o
      WHERE o.space_id = a.space_id AND o.overlaps_with = b.space_id
   )
 )
JOIN spaces s ON s.id = a.space_id
WHERE a.status <> 'released'
  AND b.status <> 'released'
  AND a.ends_at > now();

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM spaces WHERE is_active;
  IF n < 150 THEN
    RAISE EXCEPTION 'Room list loaded only % spaces', n;
  END IF;
  RAISE NOTICE 'Loaded % active spaces', n;
END $$;
