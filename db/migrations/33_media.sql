-- ============================================================
-- Migration 33 - Media library
--
-- Images live in Cloudinary; this records what was uploaded, by
-- whom, and where it is used. Keeping a local record means the
-- back office can show a library without calling Cloudinary on
-- every page load, and means an image can be found again by what
-- it shows rather than by its URL.
--
-- Files are never deleted from here automatically. An image still
-- referenced by a published block should not vanish because
-- someone tidied the library.
-- ============================================================

CREATE TABLE media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cloudinary's identifiers. public_id is what deletion needs.
  public_id     text UNIQUE NOT NULL,
  secure_url    text NOT NULL,
  format        text,
  width         integer,
  height        integer,
  bytes         integer,

  -- What it shows, for finding it later and for screen readers.
  title         text NOT NULL,
  alt_text      text,
  tags          text[],

  uploaded_by   uuid REFERENCES users(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  is_archived   boolean NOT NULL DEFAULT false
);

CREATE INDEX ON media (uploaded_at DESC) WHERE NOT is_archived;
CREATE INDEX ON media USING gin (tags);

-- Point site blocks at a media row rather than only at a URL, so
-- renaming or replacing an image updates everywhere it appears.
ALTER TABLE site_blocks
  ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE site_settings
  ADD COLUMN hero_media_id uuid REFERENCES media(id) ON DELETE SET NULL;

-- Where an image is being used. Answers "can I archive this?"
CREATE VIEW media_usage AS
SELECT
  m.id,
  m.public_id,
  m.title,
  count(b.id) FILTER (WHERE b.id IS NOT NULL) AS block_count,
  bool_or(s.id IS NOT NULL) AS is_hero,
  array_remove(array_agg(b.title), NULL) AS used_in
FROM media m
LEFT JOIN site_blocks b ON b.media_id = m.id
LEFT JOIN site_settings s ON s.hero_media_id = m.id
GROUP BY m.id;
