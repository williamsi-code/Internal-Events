-- ============================================================
-- Migration 14 - Editable content pages
--
-- Policy text lives in the database rather than in code so the
-- events office can revise it without a developer or a deploy.
-- Spaces, menu, and classification pages are generated from their
-- own tables instead - the policy pages are the only ones that
-- are genuinely prose.
--
-- The body accepts a small subset of markdown: '## ' for a
-- heading, '- ' for a bullet, and blank lines between paragraphs.
-- ============================================================

CREATE TABLE content_pages (
  slug        text PRIMARY KEY,
  title       text NOT NULL,
  intro       text,
  body        text NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id)
);

INSERT INTO content_pages (slug, title, intro, body) VALUES
('internal-policies',
 'Internal event policies',
 'These policies apply to events classified as Internal: College programming, department meetings, and recognized student organization events where Central is the primary beneficiary.',
 '## PLACEHOLDER - replace with Central''s actual policy text

The text on this page is a placeholder. Replace it with the internal
event policies from the events office.

## Booking and lead time

Requests should be submitted at least three weeks before the event date.
Requests made with less notice will be accommodated where capacity allows,
but menu options may be limited.

## Charges

Internal events are charged for food and disposables at cost. Labor,
facilities, and overhead are absorbed by the College as institutional
support for College programming.

## Guest counts

A final guest count is due ten days before the event. Charges are based on
the confirmed count, not on attendance. Increases after the deadline will be
accommodated where possible and may carry additional cost.

## Cancellation

- More than ten days before the event: no charge
- Within ten days: food costs already committed may be charged
- Same day: full charge

## Outside food

Food not prepared by Central Dining may not be served at internal events
without written approval. This is a food safety requirement, not a
commercial one.'),

('external-policies',
 'External event policies',
 'These policies apply to events classified as External: outside organizations, private events, and commercial bookings where the outside party is the primary beneficiary.',
 '## PLACEHOLDER - replace with Central''s actual policy text

The text on this page is a placeholder. Replace it with the external
event policies from the events office.

## Sponsorship

Outside organizations request campus space through a sponsoring Central
department or recognized organization. The sponsor is the point of contact
and is accountable for the event.

## Contract and insurance

External events require a signed facility use agreement and a certificate
of insurance naming Central College as an additional insured. Both are due
before the event is confirmed.

## Deposit and payment

A deposit is required to hold the date. The balance is due following the
event unless other arrangements are agreed in writing.

## Charges

External events are charged at commercial rates covering food, labor,
facilities, and overhead.

## Guest counts

A final guest count is due ten days before the event. Charges are based on
the confirmed count.

## Cancellation

- More than thirty days before the event: deposit refunded
- Fifteen to thirty days: deposit retained
- Fewer than fifteen days: deposit retained plus committed costs

## Alcohol, minors, and outside vendors

Events involving alcohol service, participants under eighteen, or outside
vendors carry additional requirements. The events office will advise when
any of these apply.');
