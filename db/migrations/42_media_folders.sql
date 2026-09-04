-- ============================================================
-- Migration 42 - Folders for the image library
--
-- A flat list works for twenty images and fails at two hundred.
-- Someone looking for a staff portrait should not scroll past every
-- photograph of a buffet.
--
-- The folder is stored here as well as in Cloudinary. Cloudinary's
-- folder is fixed at upload - moving a file there needs a rename
-- call - so this column is what the library actually filters on and
-- can be changed freely. They agree at upload time and may diverge
-- afterwards, which is fine: Cloudinary is storage, this is the
-- index.
-- ============================================================

ALTER TABLE media
  ADD COLUMN folder text NOT NULL DEFAULT 'other';

ALTER TABLE media
  ADD CONSTRAINT media_folder_check CHECK (folder IN (
    'food',
    'staff',
    'events',
    'graham',
    'maytag',
    'chapel',
    'other'
  ));

CREATE INDEX ON media (folder) WHERE NOT is_archived;

-- A first pass at sorting what is already there, from the title and
-- tags. Anything unrecognised stays in Other, which is the honest
-- answer rather than a confident wrong one.
UPDATE media SET folder = 'staff'
 WHERE folder = 'other'
   AND (title ILIKE '%staff%' OR title ILIKE '%chef%'
        OR title ILIKE '%portrait%' OR 'staff' = ANY(coalesce(tags, '{}')));

UPDATE media SET folder = 'graham'
 WHERE folder = 'other'
   AND (title ILIKE '%graham%' OR title ILIKE '%vermeer%'
        OR title ILIKE '%sutphen%' OR title ILIKE '%annex%');

UPDATE media SET folder = 'maytag'
 WHERE folder = 'other'
   AND (title ILIKE '%maytag%' OR title ILIKE '%bmw%'
        OR title ILIKE '%weller%' OR title ILIKE '%moore%');

UPDATE media SET folder = 'chapel'
 WHERE folder = 'other' AND title ILIKE '%chapel%';

UPDATE media SET folder = 'food'
 WHERE folder = 'other'
   AND (title ILIKE '%food%' OR title ILIKE '%buffet%'
        OR title ILIKE '%menu%' OR title ILIKE '%dish%'
        OR title ILIKE '%plate%' OR title ILIKE '%dessert%'
        OR 'food' = ANY(coalesce(tags, '{}')));

CREATE VIEW media_folder_counts AS
SELECT folder, count(*)::int AS n
  FROM media
 WHERE NOT is_archived
 GROUP BY folder;
