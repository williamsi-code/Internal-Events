-- ============================================================
-- Migration 71 - Linens, and the rest of what a room needs
--
-- The setup checklist offered tables, a stage and a podium. Linens
-- are asked for more often than any of them, carry a charge under
-- $1,200, and were being typed into the notes box - which means
-- nobody could count them.
-- ============================================================

INSERT INTO setup_options (kind, label, help_text, takes_count, sort_order)
VALUES
  ('equipment', 'Table linens',
   'Included with full banquets and service tables. A charge applies on orders under $1,200',
   true, 4),
  ('equipment', 'Linen napkins', NULL, true, 5),
  ('equipment', 'Skirting',
   'For auction, vendor and display tables. $5.00 a table', true, 6),
  ('equipment', 'Easels', NULL, true, 7),
  ('equipment', 'Registration table', NULL, true, 8),
  ('equipment', 'Coat rack', NULL, true, 9),
  ('equipment', 'Trash and recycling', NULL, false, 10),

  ('setup', 'U-shape', 'Tables in a U, everyone facing in', false, 7),
  ('setup', 'Boardroom', 'One long table', false, 8),
  ('setup', 'Lounge', 'Soft seating, no tables', false, 9),

  ('technology', 'Screen only', 'They are bringing their own projector',
   false, 4),
  ('technology', 'Conference phone', NULL, false, 5),
  ('technology', 'Hybrid meeting setup',
   'Camera and microphone for people joining remotely', false, 6)
ON CONFLICT (kind, label) DO NOTHING;

-- Every active room gets the new options to begin with, on the same
-- principle as the original seed: the office narrows it room by
-- room rather than starting from nothing.
INSERT INTO space_setup_options (space_id, option_id)
SELECT s.id, o.id
  FROM spaces s
  CROSS JOIN setup_options o
 WHERE s.is_active
   AND o.label IN (
     'Table linens', 'Linen napkins', 'Skirting', 'Easels',
     'Registration table', 'Coat rack', 'Trash and recycling',
     'U-shape', 'Boardroom', 'Lounge',
     'Screen only', 'Conference phone', 'Hybrid meeting setup'
   )
   AND EXISTS (
     SELECT 1 FROM space_setup_options x WHERE x.space_id = s.id
   )
ON CONFLICT DO NOTHING;

-- The ones that make no sense in a small room or outdoors.
DELETE FROM space_setup_options sso
 USING spaces s, setup_options o
 WHERE sso.space_id = s.id AND sso.option_id = o.id
   AND o.label IN ('U-shape', 'Boardroom')
   AND coalesce(s.capacity_seated, 0) > 60;

DELETE FROM space_setup_options sso
 USING spaces s, setup_options o
 WHERE sso.space_id = s.id AND sso.option_id = o.id
   AND o.kind = 'technology'
   AND s.category = 'Outside Spaces';

DELETE FROM space_setup_options sso
 USING spaces s, setup_options o
 WHERE sso.space_id = s.id AND sso.option_id = o.id
   AND o.label = 'Lounge'
   AND coalesce(s.capacity_seated, 0) > 40;
