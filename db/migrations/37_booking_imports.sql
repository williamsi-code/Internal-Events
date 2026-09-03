-- ============================================================
-- Migration 37 - Importing room bookings from a spreadsheet
--
-- Imported rows become room holds, not events. They occupy the
-- space so the scheduler shows the truth and conflict detection
-- works, but they have no requester, no menu and no classification,
-- because they are not catering events and pretending otherwise
-- would corrupt every report downstream.
--
-- Every import is a batch. A batch can be undone in one action,
-- which matters because the failure mode here is two hundred wrong
-- rows rather than one.
-- ============================================================

CREATE TYPE import_status AS ENUM ('previewed', 'committed', 'reverted');

CREATE TABLE import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      text NOT NULL,
  source_label  text,
  status        import_status NOT NULL DEFAULT 'previewed',
  row_count     integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  notes         text,
  imported_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reverted_at   timestamptz,
  reverted_by   uuid REFERENCES users(id)
);

CREATE INDEX ON import_batches (created_at DESC);

ALTER TABLE bookings
  ADD COLUMN import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  ADD COLUMN external_ref text,
  ADD COLUMN source_label text;

CREATE INDEX ON bookings (import_batch_id);

-- An imported hold has no request behind it, which the existing
-- check would reject. Widen it to allow imports as a third kind of
-- booking that stands alone.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_check1;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_check;

ALTER TABLE bookings
  ADD CONSTRAINT booking_has_an_origin CHECK (
    request_id IS NOT NULL
    OR is_blackout
    OR import_batch_id IS NOT NULL
  );

-- Room name matching. Imported spreadsheets rarely use our exact
-- names, so this normalises both sides before comparing: lowercase,
-- punctuation stripped, whitespace collapsed.
CREATE OR REPLACE FUNCTION normalise_room_name(t text)
RETURNS text AS $$
  SELECT trim(regexp_replace(
    regexp_replace(lower(coalesce(t, '')), '[^a-z0-9 ]+', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$$ LANGUAGE sql IMMUTABLE;

CREATE INDEX ON spaces (normalise_room_name(name));

-- Find a space by whatever the spreadsheet called it. Tries the room
-- name, then building and room together, then a contained match.
CREATE OR REPLACE FUNCTION match_space(p_name text, p_building text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE
  hit uuid;
  n text := normalise_room_name(p_name);
  b text := normalise_room_name(p_building);
BEGIN
  IF n = '' THEN RETURN NULL; END IF;

  SELECT id INTO hit FROM spaces
   WHERE is_active AND normalise_room_name(name) = n
     AND (b = '' OR normalise_room_name(building) = b)
   LIMIT 1;
  IF hit IS NOT NULL THEN RETURN hit; END IF;

  SELECT id INTO hit FROM spaces
   WHERE is_active
     AND normalise_room_name(coalesce(building, '') || ' ' || name) = trim(b || ' ' || n)
   LIMIT 1;
  IF hit IS NOT NULL THEN RETURN hit; END IF;

  -- Last resort: an unambiguous partial match. Ambiguous ones are
  -- deliberately left unmatched for a person to resolve.
  SELECT id INTO hit FROM spaces
   WHERE is_active AND normalise_room_name(name) LIKE '%' || n || '%'
   GROUP BY id
   HAVING count(*) = 1
   LIMIT 1;

  RETURN hit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Undo a whole import.
CREATE OR REPLACE FUNCTION revert_import(p_batch uuid, p_user uuid)
RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM bookings WHERE import_batch_id = p_batch;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE import_batches
     SET status = 'reverted', reverted_at = now(), reverted_by = p_user
   WHERE id = p_batch;

  RETURN n;
END;
$$ LANGUAGE plpgsql;
