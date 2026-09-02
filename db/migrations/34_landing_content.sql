-- ============================================================
-- Migration 34 - Warmer landing page content
--
-- Adds occasions and testimonials, and the two plain lists that
-- answer the question every enquiry opens with: what do I actually
-- get for my money.
--
-- content_block_kind becomes text with a check constraint rather
-- than an enum. New enum values cannot be added and then used in
-- the same transaction, and this table will keep gaining kinds - a
-- check constraint is one ALTER away rather than a dance.
-- ============================================================

ALTER TABLE site_blocks ALTER COLUMN kind TYPE text;
DROP TYPE IF EXISTS content_block_kind;

ALTER TABLE site_blocks
  ADD CONSTRAINT site_blocks_kind_check CHECK (kind IN (
    'news',
    'menu_spotlight',
    'staff_spotlight',
    'gallery',
    'occasion',
    'testimonial'
  ));

-- The lists, and the softer hero wording the warmer layout wants.
ALTER TABLE site_settings
  ADD COLUMN services_list text,
  ADD COLUMN amenities_list text,
  ADD COLUMN services_heading text NOT NULL DEFAULT 'What we do',
  ADD COLUMN amenities_heading text NOT NULL DEFAULT 'What is included',
  ADD COLUMN address text,
  ADD COLUMN secondary_cta_label text,
  ADD COLUMN secondary_cta_url text;

UPDATE site_settings SET
  hero_eyebrow = 'Full service catering, since 1853',
  hero_title = 'Your event matters to us',
  hero_subtitle = 'From a department lunch to a wedding reception, we cook it, set it, and clear it away. Come and see the space for yourself.',
  address = '812 University Street, Pella, Iowa 50219',
  secondary_cta_label = 'See our spaces',
  secondary_cta_url = '/info/event-spaces',
  services_list = 'Menu planning and tastings
Room layout and setup
Service staff throughout
Bar service and bartenders
Teardown and clean-up
Dietary accommodation',
  amenities_list = 'Tables and chairs
Linens and napkins
China and glassware
Parking
Wifi and AV
Indoor and outdoor spaces'
WHERE id;

-- Three occasions to start from. Replace the text and add images
-- in Back office - Front page.
INSERT INTO site_blocks (kind, title, subtitle, body, link_url, link_label, sort_order)
VALUES
('occasion', 'Weddings and receptions', 'Weddings',
 'We take care of the details so you can soak up the day. Ceremony space, reception, and everything in between.',
 '/order', 'Start planning', 1),
('occasion', 'Celebrations', 'Special occasions',
 'Reunions, showers, retirements and anniversaries. A room for every size, from a dozen to several hundred.',
 '/order', 'Start planning', 2),
('occasion', 'Meetings and conferences', 'Business',
 'Working lunches, board dinners, retreats and multi-day conferences. On campus, with everything included.',
 '/order', 'Start planning', 3);

INSERT INTO site_blocks (kind, title, subtitle, body, sort_order)
VALUES
('testimonial',
 'PLACEHOLDER: replace with a real quotation',
 'A Central department',
 'The food was genuinely excellent and the room looked beautiful. They thought of things we had not.',
 1);
