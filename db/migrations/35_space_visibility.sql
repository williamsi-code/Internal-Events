-- ============================================================
-- Migration 35 - Which spaces outside customers can see
--
-- Most of campus is bookable by a Central department and by nobody
-- else. Showing an outside customer 172 rooms - including residence
-- hall lounges and chemistry labs - invites requests the events
-- office has to decline one at a time.
--
-- Three buildings are the public face: Maytag Student Center,
-- Graham Conference Center, and the Chapel. Everything else is
-- internal only.
--
-- The flag sits per room rather than per building, so an exception
-- takes a checkbox rather than a migration.
-- ============================================================

ALTER TABLE spaces
  ADD COLUMN externally_bookable boolean NOT NULL DEFAULT false;

UPDATE spaces
   SET externally_bookable = true
 WHERE is_active
   AND building IN (
     'Maytag Student Center',
     'Graham Conference Center',
     'Chapel'
   );

CREATE INDEX ON spaces (externally_bookable) WHERE is_active;

COMMENT ON COLUMN spaces.externally_bookable IS
  'Visible to outside customers on the public spaces page and the ordering form. Internal requests can still book any active space.';

-- A few rooms in those buildings are not really event spaces, so
-- they come off the public list. They remain bookable internally.
UPDATE spaces
   SET externally_bookable = false
 WHERE name IN ('Corridor', 'Maytag Fitness Center', 'Hinga Room');

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM spaces WHERE is_active AND externally_bookable;
  RAISE NOTICE '% spaces visible to outside customers', n;
  IF n = 0 THEN
    RAISE EXCEPTION 'No externally bookable spaces - check the building names';
  END IF;
END $$;
