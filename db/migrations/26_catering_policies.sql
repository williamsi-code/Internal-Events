-- ============================================================
-- Migration 26 - Catering policies from the published menu
--
-- Two corrections and one addition, all from the menu document.
--
-- 1. Final guest counts are due SEVEN days before the event, not
--    ten. Ten was my assumption; seven is Central's policy.
-- 2. A $300 deposit is due when the date is booked, and a signed
--    agreement with a 50% non-refundable deposit confirms an order.
-- 3. The catering policies now have real text rather than
--    placeholders.
-- ============================================================

-- ------------------------------------------------------------
-- Seven days, not ten
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_headcount_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.headcount_due_on IS NULL AND NEW.event_date IS NOT NULL THEN
    NEW.headcount_due_on := NEW.event_date - INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION shift_headcount_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_date IS DISTINCT FROM OLD.event_date
     AND NEW.headcount_submitted_at IS NULL THEN
    NEW.headcount_due_on := NEW.event_date - INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Move deadlines on anything not yet submitted.
UPDATE event_requests
   SET headcount_due_on = event_date - INTERVAL '7 days'
 WHERE headcount_submitted_at IS NULL
   AND event_date >= CURRENT_DATE;

-- ------------------------------------------------------------
-- Deposits
-- ------------------------------------------------------------

CREATE TABLE event_deposits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  kind          text NOT NULL,          -- 'booking' | 'confirming'
  amount_due    numeric(10,2) NOT NULL CHECK (amount_due >= 0),
  due_on        date,
  amount_paid   numeric(10,2),
  paid_on       date,
  waived        boolean NOT NULL DEFAULT false,
  waived_reason text,
  note          text,
  recorded_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON event_deposits (request_id);
CREATE INDEX ON event_deposits (due_on) WHERE paid_on IS NULL AND NOT waived;

-- Outstanding deposits on events that have not happened yet.
CREATE VIEW deposits_outstanding AS
SELECT
  d.id,
  d.request_id,
  r.reference_code,
  r.event_name,
  r.event_date,
  d.kind,
  d.amount_due,
  d.due_on,
  (d.due_on - CURRENT_DATE) AS days_remaining,
  cd.classification
FROM event_deposits d
JOIN event_requests r ON r.id = d.request_id
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
WHERE d.paid_on IS NULL
  AND NOT d.waived
  AND r.event_date >= CURRENT_DATE
  AND r.status NOT IN ('cancelled', 'denied')
ORDER BY d.due_on;

-- ------------------------------------------------------------
-- Real policy text
-- ------------------------------------------------------------

UPDATE content_pages SET
  title = 'Catering policies',
  intro = 'These apply to all catering orders, on campus and off. Central College Catering, 641.628.5788, catering@central.edu.',
  body = '## Ordering

We are closed on Sundays. Office hours are 7am to 4:30pm, Monday through
Friday.

Additional menu items are available on request. Check with the catering
office to determine availability.

We reserve the right to refuse an event based on our availability, and to
cancel catering services due to weather or other natural disasters.

## Dietary requirements

We can accommodate most dietary requirements. Contact the catering office
at least five business days before your event with requests. Additional
fees may apply.

Our kitchen is not allergen free.

## Guest counts and deposits

A $300 deposit is due when your date is booked.

A signed agreement and a non-refundable deposit of 50% are required to
confirm all catering orders.

Final guest counts are due seven days before the event. Any increase in
guest count after the final guarantee is subject to availability and
additional charges.

Children aged 4 to 8 are half price.

## Cancellation

- More than 30 days before the event: refund of all payments except the deposit
- Within 30 days: additional charges may apply, up to the full contracted amount, based on costs already incurred
- Within 72 hours: no refunds

## Pricing

All pricing is subject to change due to seasonal availability and market
prices.

## On campus

Central Buffet orders include china, glassware and table service. All
other meals include paper products. Central Buffet is one trip per guest.

Table linens and napkins are included in the price of all full banquets
and for all service tables. Additional charges apply for table linens when
the catering order is under $1,200. There is a $5.00 per table fee for all
auction or vendor table linen and skirting.

You may provide the cake or dessert from a catering service outside of
Central Catering. There is a $1.00 per person fee to cut and plate dessert
items, which includes dessert plates and utensils.

Bar packages are available with catering services and include beer,
seltzers and wine. Craft beer upgrades are available. Fees apply.

## Off campus

- $20 delivery fee in Pella, drop off only
- $40 delivery fee in Pella, suitcases
- $50 delivery fee in Pella, chafers, under 100 guests. Over 100 guests, additional fees apply
- Additional fees apply outside the Pella city limits

Pricing includes paper products. Reflective ware is available at $2.00 per
place setting. China and glassware may be rented at $7.00 per place
setting when Central caters the event. Linens may be rented at $5.00 per
table and $1.00 per napkin when the event is catered by Central College
Catering.

Central Buffet pricing includes one staff member for the duration of the
meal service. Additional staff may be available at $25 per hour.

Off-site bar packages are available with catering services.

## Leftovers

In compliance with State of Iowa regulations, all leftover food remains
the property of Central College.',
  updated_at = now()
WHERE slug = 'internal-policies';

UPDATE content_pages SET
  title = 'External event policies',
  intro = 'These apply in addition to the catering policies where an outside organization or private party is the primary beneficiary of the event.',
  body = '## PLACEHOLDER - external-specific terms still needed

The catering policies apply to every order. This page should carry what
is additional for external events: facility use agreements, insurance
requirements, sponsorship, and any commercial terms.

## Deposits and confirmation

A $300 deposit is due when the date is booked. A signed agreement and a
non-refundable deposit of 50% are required to confirm the order.

## Cancellation

- More than 30 days before the event: refund of all payments except the deposit
- Within 30 days: additional charges may apply, up to the full contracted amount
- Within 72 hours: no refunds

## Guest counts

Final guest counts are due seven days before the event. Increases after
the final guarantee are subject to availability and additional charges.

## Facility charges

Where Central Catering is not providing the food, a facility charge
applies at the external rate for the space booked.',
  updated_at = now()
WHERE slug = 'external-policies';
