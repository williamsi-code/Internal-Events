-- ============================================================
-- Migration 20 - Outside caterers and food sources
--
-- Food provision is a set, not a single choice: an event can have
-- Central Dining on the reception and an outside caterer on
-- dessert. Modelling it as one field would force a false choice
-- and lose the split.
--
-- Donation sits with outside caterers rather than with funding.
-- Sponsorship is money arriving while Central cooks; donation is
-- outside food arriving on campus, which is a food safety matter
-- and behaves like the caterer branch in every way that counts.
-- ============================================================

CREATE TYPE caterer_status AS ENUM (
  'pending',
  'approved',
  'declined',
  'suspended'
);

CREATE TABLE caterers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name         text NOT NULL,
  contact_name          text NOT NULL,
  contact_email         citext NOT NULL,
  contact_phone         text,
  website               text,
  address               text,

  -- What staff need to see before approving.
  license_number        text,
  license_expires_on    date,
  insurance_carrier     text,
  insurance_expires_on  date,
  servsafe_certified    boolean NOT NULL DEFAULT false,
  health_inspection_on  date,
  cuisine_notes         text,
  applicant_notes       text,

  status                caterer_status NOT NULL DEFAULT 'pending',
  status_note           text,
  reviewed_by           uuid REFERENCES users(id),
  reviewed_at           timestamptz,

  applied_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (business_name)
);

CREATE INDEX ON caterers (status);
CREATE INDEX ON caterers (insurance_expires_on)
  WHERE status = 'approved';

-- An approved caterer whose insurance has lapsed is not usable,
-- whatever the status column says. Reading approval through this
-- view means nobody has to remember to check the date.
CREATE VIEW usable_caterers AS
SELECT c.*,
       (c.insurance_expires_on IS NOT NULL
        AND c.insurance_expires_on < CURRENT_DATE) AS insurance_lapsed,
       (c.license_expires_on IS NOT NULL
        AND c.license_expires_on < CURRENT_DATE)   AS license_lapsed
  FROM caterers c
 WHERE c.status = 'approved';

CREATE TABLE caterer_status_changes (
  id           bigserial PRIMARY KEY,
  caterer_id   uuid NOT NULL REFERENCES caterers(id) ON DELETE CASCADE,
  from_status  caterer_status,
  to_status    caterer_status NOT NULL,
  note         text,
  changed_by   uuid REFERENCES users(id),
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON caterer_status_changes (caterer_id, changed_at DESC);

-- ------------------------------------------------------------
-- Food sources on a request
-- ------------------------------------------------------------

CREATE TYPE food_source_kind AS ENUM (
  'central_dining',
  'outside_caterer',
  'donated',
  'no_food'
);

CREATE TABLE event_food_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  kind         food_source_kind NOT NULL,
  caterer_id   uuid REFERENCES caterers(id),
  caterer_other text,
  -- Which part of the event this source covers, when the catering
  -- is split: "reception only", "dessert", "morning break".
  covers        text,
  policy_acknowledged_at timestamptz,
  policy_acknowledged_by uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- An outside caterer must be named, one way or another.
  CHECK (kind <> 'outside_caterer'
         OR caterer_id IS NOT NULL
         OR caterer_other IS NOT NULL),
  UNIQUE (request_id, kind, caterer_id)
);

CREATE INDEX ON event_food_sources (request_id);
CREATE INDEX ON event_food_sources (caterer_id);

-- Backfill: every existing request is Central Dining unless it has
-- no food requirements recorded at all.
INSERT INTO event_food_sources (request_id, kind)
SELECT r.id,
       CASE WHEN coalesce(nullif(trim(req.food_needs), ''), '') = ''
            THEN 'no_food'::food_source_kind
            ELSE 'central_dining'::food_source_kind
       END
  FROM event_requests r
  LEFT JOIN event_requirements req ON req.request_id = r.id
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Policy pages for the caterer path
-- ------------------------------------------------------------

INSERT INTO content_pages (slug, title, intro, body) VALUES
('outside-caterer-policy',
 'Outside caterer requirements',
 'What an approved outside caterer and the sponsoring Central department each agree to when food is brought onto campus.',
 '## PLACEHOLDER - replace with Central''s actual policy text

The text on this page is a placeholder. Replace it with the outside
caterer policy from the events office.

## Approval

Only caterers on Central''s approved list may serve food on campus.
Approval requires a current food service license, liability insurance
naming Central College as an additional insured, and a satisfactory
health inspection.

## The sponsoring department

A Central department or recognized organization sponsors every outside
caterer engagement and is accountable for the event, including the
caterer''s conduct, timing, and clean-up.

## On the day

- The caterer is responsible for their own equipment, service ware and transport
- Central kitchen facilities are not available unless separately agreed
- The space must be returned to its prior condition
- All food waste leaves with the caterer

## Food safety

Temperature control, holding times, and allergen labelling remain the
caterer''s responsibility. Central does not inspect or supervise food
prepared off campus.

## Insurance

A certificate of insurance must be on file and current on the date of
the event. A lapsed certificate removes the caterer from the approved
list until it is renewed.'),

('donated-food-policy',
 'Donated food requirements',
 'What applies when food is donated rather than purchased, whether by an outside organization or an individual.',
 '## PLACEHOLDER - replace with Central''s actual policy text

The text on this page is a placeholder. Replace it with the donated
food policy from the events office.

## Why donated food is treated separately

Donated food is outside food arriving on campus. The question is not
who paid for it but who prepared it and under what conditions, so the
same food safety considerations apply as for any outside caterer.

## What is required

- The source of the food must be named and recorded
- Commercially prepared food from a licensed kitchen is preferred
- Home-prepared food may not be served at events open to the public
- Allergen information must be available for everything served

## Temperature and holding

Donated food must arrive at a safe temperature and be served within
safe holding times. Central cannot verify what happened to it before
arrival, which is why the sponsoring department accepts responsibility
for it.

## Sponsoring department

As with outside caterers, a Central department or recognized
organization sponsors and is accountable for donated food served at
their event.')
ON CONFLICT (slug) DO NOTHING;
