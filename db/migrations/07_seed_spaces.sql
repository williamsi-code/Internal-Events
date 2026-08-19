-- Placeholder event spaces. EDIT THESE to match Central's real
-- inventory, then update the rows directly in Railway afterwards.

INSERT INTO spaces (name, building, capacity_seated, capacity_standing, supports_catering, description, sort_order) VALUES
  ('Dining Hall',         'Central Market',         300, 400, true,  'Main dining room. Available outside regular service hours.', 1),
  ('Private Dining Room', 'Central Market',          40,  50, true,  'Adjacent to the main dining hall.', 2),
  ('Ballroom',            'Maytag Student Center',  250, 350, true,  'Largest event space. Divisible into two halves.', 3),
  ('Meeting Room A',      'Maytag Student Center',   30,  40, true,  'Standard meeting room with projection.', 4),
  ('Meeting Room B',      'Maytag Student Center',   30,  40, true,  'Standard meeting room with projection.', 5),
  ('Atrium',              'Vermeer Science Center', 120, 200, true,  'Open reception space. Limited setup options.', 6),
  ('Auditorium',          'Douwstra',               400, 400, false, 'Fixed seating. No food or drink permitted inside.', 7),
  ('Conference Center',   'Graham',                 150, 200, true,  'Configurable conference space with breakout rooms.', 8),
  ('Campus Green',        'Outdoor',                200, 500, true,  'Weather dependent. Requires a confirmed indoor alternative.', 9)
ON CONFLICT DO NOTHING;