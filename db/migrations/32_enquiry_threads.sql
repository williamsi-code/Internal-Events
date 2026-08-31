-- ============================================================
-- Migration 32 - Enquiries become conversations
--
-- An enquiry was a one-way form: it arrived, and any reply happened
-- in email where neither side could see it afterwards. This gives
-- an enquiry an owner, a status, and a thread - the same shape as a
-- request, without pretending it is an event.
--
-- It also requires an account. That is a real cost to the person
-- asking, and worth it: without one there is nowhere to show them
-- the answer, and the conversation falls back into email.
-- ============================================================

CREATE TYPE enquiry_status AS ENUM (
  'new',
  'answered',        -- staff replied, waiting on them
  'awaiting_staff',  -- they replied, waiting on us
  'converted',       -- became a request or an order
  'closed'
);

ALTER TABLE enquiries
  ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN status enquiry_status NOT NULL DEFAULT 'new',
  ADD COLUMN converted_request_id uuid
    REFERENCES event_requests(id) ON DELETE SET NULL,
  ADD COLUMN reference_code text UNIQUE
    DEFAULT 'ENQ-' || to_char(now(), 'YY') || '-' ||
            lpad((floor(random() * 100000))::text, 5, '0'),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX ON enquiries (user_id, created_at DESC);
CREATE INDEX ON enquiries (status) WHERE status IN ('new', 'awaiting_staff');

-- Backfill: match older enquiries to an account by email where one
-- exists, so nothing already sent is orphaned.
UPDATE enquiries e
   SET user_id = u.id
  FROM users u
 WHERE u.email = e.email
   AND e.user_id IS NULL;

UPDATE enquiries
   SET reference_code = 'ENQ-' || to_char(created_at, 'YY') || '-' ||
                        lpad((floor(random() * 100000))::text, 5, '0')
 WHERE reference_code IS NULL;

CREATE TABLE enquiry_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id  uuid NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id),
  body        text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  is_staff    boolean NOT NULL DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON enquiry_messages (enquiry_id, created_at);
CREATE INDEX ON enquiry_messages (enquiry_id)
  WHERE read_at IS NULL AND NOT is_internal;

-- The opening message is the enquiry itself, so the thread reads as
-- a conversation from the first line rather than starting halfway.
INSERT INTO enquiry_messages (enquiry_id, author_id, body, is_staff, created_at)
SELECT e.id, e.user_id, e.message, false, e.created_at
  FROM enquiries e
 WHERE NOT EXISTS (
   SELECT 1 FROM enquiry_messages m WHERE m.enquiry_id = e.id
 );

-- Status follows the last message rather than being set by hand, so
-- it cannot drift from what the thread actually shows.
CREATE OR REPLACE FUNCTION enquiry_status_follows_thread()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  UPDATE enquiries
     SET status = CASE
                    WHEN status = 'converted' THEN 'converted'
                    WHEN status = 'closed' THEN 'closed'
                    WHEN NEW.is_staff THEN 'answered'::enquiry_status
                    ELSE 'awaiting_staff'::enquiry_status
                  END,
         updated_at = now()
   WHERE id = NEW.enquiry_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enquiry_message_sets_status
  AFTER INSERT ON enquiry_messages
  FOR EACH ROW EXECUTE FUNCTION enquiry_status_follows_thread();

-- What the events office still owes an answer on.
CREATE VIEW enquiries_open AS
SELECT
  e.id,
  e.reference_code,
  e.name,
  e.email,
  e.organization,
  e.event_type,
  e.approx_date,
  e.approx_guests,
  e.status,
  e.created_at,
  e.updated_at,
  (EXTRACT(day FROM now() - e.updated_at))::int AS days_since_activity,
  (SELECT count(*) FROM enquiry_messages m
    WHERE m.enquiry_id = e.id AND NOT m.is_staff AND m.read_at IS NULL)
    AS unread_from_them
FROM enquiries e
WHERE e.status IN ('new', 'awaiting_staff', 'answered')
ORDER BY
  CASE e.status WHEN 'new' THEN 0 WHEN 'awaiting_staff' THEN 1 ELSE 2 END,
  e.updated_at;
