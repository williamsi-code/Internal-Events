-- ============================================================
-- Migration 49 - Manual lines and notes on the catering sheet
--
-- The menu cannot cover everything. Market-value prime rib, a rental
-- charge, a delivery fee, an agreed discount - these are real money
-- and were previously handled by someone writing on the printout,
-- which means the system's total was wrong and the reports with it.
--
-- A manual line is therefore part of the quoted total, not an
-- annotation. Notes are separate: those are for the kitchen and
-- carry no money.
-- ============================================================

CREATE TYPE manual_line_kind AS ENUM (
  'food',
  'labor',
  'rental',
  'delivery',
  'discount',
  'other'
);

CREATE TABLE sheet_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  kind        manual_line_kind NOT NULL DEFAULT 'other',
  description text NOT NULL,
  quantity    numeric(10,2) NOT NULL DEFAULT 1,
  unit_price  numeric(10,2) NOT NULL,
  unit_label  text,
  -- Kitchen-only lines carry no charge and stay off the customer's
  -- estimate: an extra tray of something the chef wants on hand.
  is_charged  boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CHECK (quantity <> 0)
);

CREATE INDEX ON sheet_lines (request_id, sort_order);

-- A discount is a negative line rather than a separate concept, so
-- the arithmetic stays ordinary.
COMMENT ON COLUMN sheet_lines.unit_price IS
  'May be negative. A discount is a line with a negative price rather than a special case.';

ALTER TABLE event_requests
  ADD COLUMN sheet_notes text;

COMMENT ON COLUMN event_requests.sheet_notes IS
  'Free notes printed on the catering sheet for the kitchen and service staff. Not visible to the requester.';

-- ------------------------------------------------------------
-- Manual charges are part of what the event was quoted
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION manual_total(p_request_id uuid)
RETURNS numeric AS $fn$
  SELECT coalesce(sum(quantity * unit_price), 0)
    FROM sheet_lines
   WHERE request_id = p_request_id AND is_charged;
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION quoted_total(p_request_id uuid)
RETURNS numeric AS $fn$
  SELECT coalesce(
    (SELECT sum(sel.quantity * sel.unit_price_quoted)
       FROM request_menu_selections sel
      WHERE sel.request_id = p_request_id), 0)
  + coalesce(
    (SELECT r.facility_charge_applied
       FROM event_requests r WHERE r.id = p_request_id), 0)
  + coalesce(
    (SELECT sp.estimated_charge
       FROM service_paths sp
      WHERE sp.request_id = p_request_id AND sp.is_current), 0)
  + manual_total(p_request_id);
$fn$ LANGUAGE sql STABLE;

-- Manual lines have no external equivalent to compare against, so
-- they count the same at both rates. A rental charge is a rental
-- charge whoever is paying.
CREATE OR REPLACE FUNCTION external_value(p_request_id uuid)
RETURNS numeric AS $fn$
  SELECT coalesce(
    (SELECT sum(sel.quantity * p.unit_price)
       FROM request_menu_selections sel
       JOIN event_requests r ON r.id = sel.request_id
       JOIN LATERAL (
         SELECT unit_price
           FROM menu_item_prices mp
          WHERE mp.menu_item_id = sel.menu_item_id
            AND mp.path = 'external_commercial'
            AND mp.effective_from <= r.event_date
            AND (mp.effective_to IS NULL OR mp.effective_to > r.event_date)
          ORDER BY mp.effective_from DESC
          LIMIT 1
       ) p ON true
      WHERE sel.request_id = p_request_id), 0)
  + coalesce(
    (SELECT CASE
              WHEN r.facility_charge_applied IS NOT NULL
                THEN s.facility_rate_external
              ELSE 0
            END
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
      WHERE r.id = p_request_id), 0)
  + manual_total(p_request_id);
$fn$ LANGUAGE sql STABLE;
