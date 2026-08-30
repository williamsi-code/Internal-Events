-- ============================================================
-- Migration 28 - Public site content
--
-- News, spotlights and hero copy, all editable from the back
-- office. Content lives in the database rather than in code so the
-- events office can keep the front page current without a deploy -
-- which is the difference between a page that stays fresh and one
-- that quietly ages.
--
-- Images are URLs for now. File upload needs blob storage, which
-- is not wired yet.
-- ============================================================

CREATE TYPE content_block_kind AS ENUM (
  'news',
  'menu_spotlight',
  'staff_spotlight',
  'gallery'
);

CREATE TABLE site_blocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         content_block_kind NOT NULL,
  title        text NOT NULL,
  subtitle     text,
  body         text,
  image_url    text,
  image_alt    text,
  link_url     text,
  link_label   text,
  -- Menu spotlights can point at a real item so the price shown is
  -- never a copy that drifts out of date.
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  publish_from date,
  publish_to   date,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES users(id)
);

CREATE INDEX ON site_blocks (kind, sort_order) WHERE is_published;

-- Single-row settings for the front page. A table rather than
-- constants so the wording can change without a developer.
CREATE TABLE site_settings (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  hero_eyebrow       text NOT NULL DEFAULT 'Central College',
  hero_title         text NOT NULL DEFAULT 'Events & Conferences',
  hero_subtitle      text,
  hero_image_url     text,
  intro_heading      text,
  intro_body         text,
  contact_phone      text,
  contact_email      text,
  office_hours       text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES users(id)
);

INSERT INTO site_settings (
  id, hero_eyebrow, hero_title, hero_subtitle,
  intro_heading, intro_body,
  contact_phone, contact_email, office_hours
) VALUES (
  true,
  'Central College',
  'Events & Conferences',
  'From a department lunch to a wedding reception, we cook it, set it, and clear it away.',
  'However you are starting',
  'Central College Catering serves the campus community and the wider Pella area. Whether you are booking a College event, planning a celebration with us, or just working out what is possible, start in the right place below.',
  '641.628.5788',
  'catering@central.edu',
  'Monday to Friday, 7am to 4:30pm. Closed Sundays.'
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- General enquiries
--
-- The third gateway. Someone who is neither a Central department
-- nor ready to order needs somewhere to go that is not a form
-- asking them to classify their event.
-- ------------------------------------------------------------

CREATE TABLE enquiries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         citext NOT NULL,
  phone         text,
  organization  text,
  event_type    text,
  approx_date   date,
  approx_guests integer,
  message       text NOT NULL,
  source        text,
  handled_at    timestamptz,
  handled_by    uuid REFERENCES users(id),
  handled_note  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON enquiries (created_at DESC) WHERE handled_at IS NULL;

-- ------------------------------------------------------------
-- Starter content, so the page is not empty on first load.
-- Replace all of this in Back office - Front page.
-- ------------------------------------------------------------

INSERT INTO site_blocks (kind, title, subtitle, body, sort_order) VALUES
('news', 'PLACEHOLDER: Fall menu now available',
 'Seasonal additions',
 'Replace this in the back office. News items appear newest first and can be scheduled with a publish window.', 1),
('news', 'PLACEHOLDER: Now booking spring events',
 'Dates going quickly',
 'Replace this in the back office. Add an image URL to any item and it will render as a card with a picture.', 2),
('staff_spotlight', 'PLACEHOLDER: Meet the team',
 'Central College Catering',
 'Replace this with a real staff profile. A photograph, a name, a role, and a couple of sentences about what they do here.', 1);

INSERT INTO site_blocks (kind, title, subtitle, body, menu_item_id, sort_order)
SELECT 'menu_spotlight', mi.name, c.name,
       'Replace this with why it is worth ordering. The price shown comes from the live menu, so it never drifts.',
       mi.id, 1
  FROM menu_items mi
  JOIN menu_categories c ON c.id = mi.category_id
 WHERE mi.name = 'The Big Red Breakfast'
 LIMIT 1;
