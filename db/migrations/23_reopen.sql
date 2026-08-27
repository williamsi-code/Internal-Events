-- ============================================================
-- Migration 23 - Reopening confirmed details
--
-- Menus change. A department adds forty people, drops the dessert,
-- switches to a buffet. Without a way to reopen, staff keep the real
-- order in email and the system quietly becomes wrong - which is the
-- failure it exists to prevent.
--
-- Reopening does not release the room. The event is still happening
-- in that space on that date; only what is being served is in
-- question. Dropping the booking to tentative would risk losing the
-- room over a change of sandwich.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN details_reopened_at timestamptz,
  ADD COLUMN details_reopened_by uuid REFERENCES users(id),
  ADD COLUMN details_reopen_count integer NOT NULL DEFAULT 0;

-- What the order looked like before a change, so a dispute about
-- "we never ordered that" has an answer.
CREATE TABLE menu_selection_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  captured_at       timestamptz NOT NULL DEFAULT now(),
  captured_reason   text,
  captured_by       uuid REFERENCES users(id),
  selections        jsonb NOT NULL,
  total             numeric(10,2)
);

CREATE INDEX ON menu_selection_history (request_id, captured_at DESC);

-- Snapshot the order whenever details are reopened, before the
-- requester can change anything.
CREATE OR REPLACE FUNCTION snapshot_menu_on_reopen()
RETURNS trigger AS $$
BEGIN
  IF NEW.details_reopened_at IS NULL
     OR NEW.details_reopened_at IS NOT DISTINCT FROM OLD.details_reopened_at THEN
    RETURN NEW;
  END IF;

  INSERT INTO menu_selection_history
    (request_id, captured_reason, captured_by, selections, total)
  SELECT NEW.id,
         'Details reopened',
         NEW.details_reopened_by,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'item', mi.name,
               'quantity', sel.quantity,
               'unit_price', sel.unit_price_quoted
             )
           ),
           '[]'::jsonb
         ),
         coalesce(sum(sel.quantity * sel.unit_price_quoted), 0)
    FROM request_menu_selections sel
    JOIN menu_items mi ON mi.id = sel.menu_item_id
   WHERE sel.request_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reopen_snapshots_menu
  BEFORE UPDATE OF details_reopened_at ON event_requests
  FOR EACH ROW EXECUTE FUNCTION snapshot_menu_on_reopen();

-- Events reopened close to the date, where the kitchen may already
-- have ordered against the previous figures.
CREATE VIEW late_menu_changes AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  (r.event_date - CURRENT_DATE) AS days_out,
  r.details_reopen_count,
  to_char(r.details_reopened_at, 'Mon FMDD') AS reopened_on,
  u.full_name AS reopened_by
FROM event_requests r
LEFT JOIN users u ON u.id = r.details_reopened_by
WHERE r.details_reopened_at IS NOT NULL
  AND r.details_confirmed_at IS NULL
  AND r.event_date >= CURRENT_DATE
  AND r.event_date - CURRENT_DATE <= 10
  AND r.status NOT IN ('cancelled', 'denied');
