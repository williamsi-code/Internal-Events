-- ============================================================
-- Migration 13 - Final headcount
--
-- Ten days before the event, the requester owes a final guest
-- count. Nothing here is scheduled: the due date is stored, and
-- everything that needs to know about it computes from the
-- current date. That means it works without cron, email, or any
-- background process - and stays correct if one is added later.
-- ============================================================

ALTER TABLE event_requests
  ADD COLUMN headcount_submitted_at timestamptz,
  ADD COLUMN headcount_submitted_by uuid REFERENCES users(id);

-- Calendar days, not business days. Ten calendar days before a
-- Monday event lands on a Friday, which is when the kitchen wants
-- the number anyway. Change the interval here if the events office
-- works to a different lead time.
CREATE OR REPLACE FUNCTION set_headcount_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.headcount_due_on IS NULL AND NEW.event_date IS NOT NULL THEN
    NEW.headcount_due_on := NEW.event_date - INTERVAL '10 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER headcount_due_on_insert
  BEFORE INSERT ON event_requests
  FOR EACH ROW EXECUTE FUNCTION set_headcount_due();

-- If the event moves, the deadline moves with it - unless the
-- count is already in, in which case the requester has done their
-- part and should not be asked again.
CREATE OR REPLACE FUNCTION shift_headcount_due()
RETURNS trigger AS $$
BEGIN
  IF NEW.event_date IS DISTINCT FROM OLD.event_date
     AND NEW.headcount_submitted_at IS NULL THEN
    NEW.headcount_due_on := NEW.event_date - INTERVAL '10 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER headcount_due_on_date_change
  BEFORE UPDATE OF event_date ON event_requests
  FOR EACH ROW EXECUTE FUNCTION shift_headcount_due();

UPDATE event_requests
   SET headcount_due_on = event_date - INTERVAL '10 days'
 WHERE headcount_due_on IS NULL;

CREATE INDEX ON event_requests (headcount_due_on)
  WHERE headcount_submitted_at IS NULL;

-- Everything waiting on a count, with how late it is. Negative
-- days_remaining means overdue.
CREATE VIEW headcount_outstanding AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  r.headcount_due_on,
  (r.headcount_due_on - CURRENT_DATE) AS days_remaining,
  r.estimated_attendance,
  r.requester_name,
  r.contact_email,
  r.department_org,
  cd.classification
FROM event_requests r
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
WHERE r.headcount_submitted_at IS NULL
  AND r.event_date >= CURRENT_DATE
  AND r.status IN ('confirmed', 'pending_final_review', 'details_pending')
ORDER BY r.headcount_due_on;
