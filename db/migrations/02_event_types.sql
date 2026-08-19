-- ============================================================
-- Central College Events & Conferences
-- Migration 02 — Event type catalog
--
-- Encodes the Event Classification Matrix as data rather than
-- logic. Each row is a worked example the events office has
-- already decided. A requester selects their event type; the
-- default classification comes from here, and the Section D
-- answers are used to detect departure from that default.
--
-- To change how a type is classified, update a row — not code.
-- ============================================================

CREATE TYPE pricing_model AS ENUM (
  'food_and_disposables',   -- internal rate
  'affiliated_rate',        -- cost recovery
  'commercial',             -- external
  'determined_by_funding'   -- resolved case by case
);

CREATE TABLE event_type_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE event_types (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id            uuid NOT NULL REFERENCES event_type_categories(id),
  name                   text NOT NULL UNIQUE,

  -- The matrix default. NULL means the matrix does not settle it.
  default_classification classification,
  default_pricing        pricing_model,

  -- True for the starred and slashed rows: the matrix names two
  -- possible outcomes, so staff always decide rather than the
  -- rules engine. Drives the "needs management review" outcome.
  always_review          boolean NOT NULL DEFAULT false,

  -- Shown to the requester under the selected type, and to staff
  -- alongside the decision.
  guidance               text,
  sort_order             integer NOT NULL DEFAULT 0,
  is_active              boolean NOT NULL DEFAULT true,

  CHECK (always_review OR default_classification IS NOT NULL)
);

CREATE INDEX ON event_types (category_id, sort_order);

ALTER TABLE event_requests
  ADD COLUMN event_type_id uuid REFERENCES event_types(id),
  ADD COLUMN event_type_other text;

ALTER TABLE event_requests
  ADD CONSTRAINT event_type_present
  CHECK (event_type_id IS NOT NULL OR event_type_other IS NOT NULL);

-- Records when a requester's Section D answers contradict the
-- default for the type they picked. This is the signal worth
-- surfacing to staff — it is where misclassification hides.
ALTER TABLE classification_answers
  ADD COLUMN deviates_from_type boolean NOT NULL DEFAULT false,
  ADD COLUMN deviation_detail text;

-- ------------------------------------------------------------
-- Seed: categories
-- ------------------------------------------------------------

INSERT INTO event_type_categories (name, sort_order) VALUES
  ('Admissions and student life',        1),
  ('Academic and employee',              2),
  ('Institutional and ceremonial',       3),
  ('Advancement, alumni and athletics',  4),
  ('Personal and private events',        5),
  ('Partner and professional groups',    6),
  ('Community and commercial',           7),
  ('Camps and conferences',              8);

-- ------------------------------------------------------------
-- Seed: event types, straight from the matrix
-- ------------------------------------------------------------

INSERT INTO event_types (category_id, name, default_classification, default_pricing, always_review, guidance, sort_order)
SELECT c.id, v.name, v.cls::classification, v.price::pricing_model, v.review, v.guidance, v.ord
FROM (VALUES

  -- Admissions and student life
  ('Admissions and student life','Admissions prospective student event','internal','food_and_disposables',false,NULL,1),
  ('Admissions and student life','Admissions counselor meeting','internal','food_and_disposables',false,NULL,2),
  ('Admissions and student life','New student orientation','internal','food_and_disposables',false,NULL,3),
  ('Admissions and student life','Student Activities event','internal','food_and_disposables',false,NULL,4),
  ('Admissions and student life','Official student organization event','internal','food_and_disposables',true,
   'Recognized student organization events are internal, but funding source, ticket revenue, and outside involvement are reviewed before the rate is set.',5),

  -- Academic and employee
  ('Academic and employee','Academic department meeting','internal','food_and_disposables',false,NULL,1),
  ('Academic and employee','College employee department meeting','internal','food_and_disposables',false,NULL,2),
  ('Academic and employee','Faculty or staff training','internal','food_and_disposables',false,NULL,3),
  ('Academic and employee','Employee recognition event','internal','food_and_disposables',false,NULL,4),
  ('Academic and employee','Employee retirement recognition sponsored by the College','internal','food_and_disposables',false,
   'Sponsored by the College. A retirement party arranged privately by the individual is an external event.',5),

  -- Institutional and ceremonial
  ('Institutional and ceremonial','Board of Trustees event','internal','food_and_disposables',false,NULL,1),
  ('Institutional and ceremonial','Presidential event','internal','food_and_disposables',false,NULL,2),
  ('Institutional and ceremonial','Commencement','internal','food_and_disposables',false,NULL,3),
  ('Institutional and ceremonial','Homecoming College programming','internal','food_and_disposables',false,NULL,4),

  -- Advancement, alumni and athletics
  ('Advancement, alumni and athletics','Advancement event','internal','food_and_disposables',false,NULL,1),
  ('Advancement, alumni and athletics','Official donor event','internal','food_and_disposables',false,NULL,2),
  ('Advancement, alumni and athletics','Official alumni event organized by the College','internal','food_and_disposables',false,NULL,3),
  ('Advancement, alumni and athletics','Alumni class event organized by Advancement','internal','food_and_disposables',false,NULL,4),
  ('Advancement, alumni and athletics','Alumni group independently renting space',NULL,NULL,true,
   'Classified external or affiliated depending on whether the College has a sponsoring role. Staff determine the applicable rate.',5),
  ('Advancement, alumni and athletics','Official Athletics team event','internal','food_and_disposables',false,NULL,6),
  ('Advancement, alumni and athletics','Athletics recruiting event','internal','food_and_disposables',false,NULL,7),

  -- Personal and private events
  ('Personal and private events','Personal retirement party for a faculty or staff member','external','commercial',false,
   'Arranged privately rather than sponsored by the College, so commercial rates apply even though the host is an employee.',1),
  ('Personal and private events','Employee birthday or anniversary party','external','commercial',false,NULL,2),
  ('Personal and private events','Employee wedding','external','commercial',false,NULL,3),
  ('Personal and private events','Alumni private wedding','external','commercial',false,NULL,4),
  ('Personal and private events','Wedding','external','commercial',false,NULL,5),
  ('Personal and private events','Private graduation party','external','commercial',false,NULL,6),

  -- Partner and professional groups
  ('Partner and professional groups','Faculty professional association meeting','affiliated','affiliated_rate',false,NULL,1),
  ('Partner and professional groups','Faculty member hosting a national association conference',NULL,NULL,true,
   'Affiliated or external depending on who controls the conference and where registration revenue goes.',2),
  ('Partner and professional groups','Outside nonprofit sponsored by a College department','affiliated','affiliated_rate',false,NULL,3),
  ('Partner and professional groups','Community organization using a College account',NULL,NULL,true,
   'Use of a College account does not by itself make an event internal. Staff confirm the sponsoring relationship.',4),
  ('Partner and professional groups','Joint Central and community program','affiliated','affiliated_rate',false,NULL,5),

  -- Community and commercial
  ('Community and commercial','Corporate conference','external','commercial',false,NULL,1),
  ('Community and commercial','Community banquet','external','commercial',false,NULL,2),

  -- Camps and conferences
  ('Camps and conferences','Central-operated summer camp',NULL,NULL,true,
   'Internal or affiliated depending on the funding model, revenue generation, and participants.',1),
  ('Camps and conferences','External summer camp','external','commercial',false,NULL,2),
  ('Camps and conferences','Outside youth camp using campus','external','commercial',false,
   'Programs serving minors carry additional screening and supervision requirements.',3)

) AS v(category, name, cls, price, review, guidance, ord)
JOIN event_type_categories c ON c.name = v.category;

-- ------------------------------------------------------------
-- Staff-facing: how often does the matrix default survive review?
-- Run this after a few months to find types worth reclassifying
-- or splitting.
-- ------------------------------------------------------------

CREATE VIEW classification_accuracy AS
SELECT
  et.name                            AS event_type,
  et.default_classification          AS matrix_default,
  cd.classification                  AS staff_decision,
  count(*)                           AS occurrences
FROM event_requests r
JOIN event_types et ON et.id = r.event_type_id
JOIN classification_decisions cd
  ON cd.request_id = r.id AND cd.is_current
GROUP BY et.name, et.default_classification, cd.classification
ORDER BY et.name;
