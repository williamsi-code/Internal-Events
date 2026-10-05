-- ============================================================
-- Migration 69 - Event types in groups
--
-- A flat list of forty types is a list nobody reads. People scroll
-- it, fail to find themselves, and pick whatever is nearest the top
-- or type something into the other box - which is how reporting ends
-- up with nine spellings of the same thing.
--
-- Grouped, someone finds their part of the list in one glance and
-- the right answer in two.
-- ============================================================

ALTER TABLE event_types
  ADD COLUMN group_name text NOT NULL DEFAULT 'Other',
  ADD COLUMN group_order integer NOT NULL DEFAULT 99;

-- The groups, in the order a campus thinks about itself.
CREATE OR REPLACE FUNCTION set_type_group(
  p_group text,
  p_order integer,
  p_patterns text[]
) RETURNS integer AS $fn$
DECLARE
  n integer;
BEGIN
  UPDATE event_types
     SET group_name = p_group, group_order = p_order
   WHERE group_name = 'Other'
     AND EXISTS (
       SELECT 1 FROM unnest(p_patterns) pat
        WHERE event_types.name ILIKE '%' || pat || '%'
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$ LANGUAGE plpgsql;

-- Order matters: the first pattern to match wins, so the narrower
-- groups are claimed before the broad ones.
SELECT set_type_group('Academic', 1, ARRAY[
  'academic', 'department meeting', 'faculty', 'lecture', 'seminar',
  'symposium', 'colloquium', 'defense', 'thesis', 'class', 'course',
  'guest speaker', 'research'
]);

SELECT set_type_group('Admissions and recruitment', 2, ARRAY[
  'admission', 'prospective', 'recruit', 'open house', 'campus visit',
  'orientation', 'preview', 'scholarship day'
]);

SELECT set_type_group('Student life', 3, ARRAY[
  'student', 'club', 'organization', 'greek', 'fraternity', 'sorority',
  'residence', 'hall', 'intramural', 'homecoming', 'formal'
]);

SELECT set_type_group('Athletics', 4, ARRAY[
  'athletic', 'sport', 'team', 'game', 'tournament', 'banquet dinner',
  'booster'
]);

SELECT set_type_group('Advancement and alumni', 5, ARRAY[
  'alumni', 'advancement', 'donor', 'foundation', 'fundrais',
  'development', 'board of trustees', 'trustee'
]);

SELECT set_type_group('Administration', 6, ARRAY[
  'administrat', 'staff meeting', 'training', 'professional development',
  'committee', 'interview', 'search', 'hr', 'human resources'
]);

SELECT set_type_group('Celebrations', 7, ARRAY[
  'wedding', 'reception', 'memorial', 'funeral', 'retirement',
  'anniversary', 'birthday', 'graduation', 'commencement',
  'celebration', 'party', 'shower'
]);

SELECT set_type_group('Conferences and camps', 8, ARRAY[
  'conference', 'camp', 'workshop', 'retreat', 'institute', 'summit',
  'convention'
]);

SELECT set_type_group('Community and outside groups', 9, ARRAY[
  'community', 'church', 'civic', 'rental', 'external', 'business',
  'corporate', 'nonprofit', 'public'
]);

-- What remains is genuinely miscellaneous, and sits last.
UPDATE event_types SET group_order = 99 WHERE group_name = 'Other';

-- Which groups ended up with nothing, so the office can see where
-- the list is thin rather than discovering it from the other box.
CREATE OR REPLACE VIEW event_type_groups AS
SELECT
  group_name,
  min(group_order) AS group_order,
  count(*)::int AS types,
  count(*) FILTER (WHERE is_active)::int AS active_types,
  (SELECT count(*)::int FROM event_requests r
     JOIN event_types t2 ON t2.id = r.event_type_id
    WHERE t2.group_name = et.group_name
      AND r.event_date > CURRENT_DATE - INTERVAL '1 year') AS events_this_year
FROM event_types et
GROUP BY group_name
ORDER BY min(group_order), group_name;

COMMENT ON COLUMN event_types.group_name IS
  'Which part of the list this sits under on the intake form. Editable in the back office.';
