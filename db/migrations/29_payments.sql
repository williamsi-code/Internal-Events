-- ============================================================
-- Migration 29 - Payments
--
-- No processor is connected yet. Rather than build a checkout that
-- goes nowhere, this records payments that already happen offline -
-- cheques, transfers, journal entries - and leaves a clearly marked
-- seam where a processor will attach.
--
-- That ordering matters. Offline payment tracking is useful on its
-- own, and building it first means connecting Stripe later is a new
-- provider rather than a new concept.
-- ============================================================

CREATE TYPE payment_provider AS ENUM (
  'manual',       -- cheque, cash, transfer, journal entry
  'stripe',       -- not connected yet
  'other'
);

CREATE TYPE payment_status AS ENUM (
  'requested',    -- asked for, nothing received
  'pending',      -- payment started but not settled
  'paid',
  'failed',
  'refunded',
  'waived',
  'cancelled'
);

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  deposit_id      uuid REFERENCES event_deposits(id) ON DELETE SET NULL,

  reference_code  text UNIQUE NOT NULL
                    DEFAULT 'PAY-' || to_char(now(), 'YY') || '-' ||
                            lpad((floor(random() * 100000))::text, 5, '0'),

  -- What this payment is for, in the requester's language.
  purpose         text NOT NULL,
  amount          numeric(10,2) NOT NULL CHECK (amount > 0),
  due_on          date,

  provider        payment_provider NOT NULL DEFAULT 'manual',
  status          payment_status NOT NULL DEFAULT 'requested',

  -- Whatever identifies the payment outside this system: a cheque
  -- number, a journal reference, or a processor's transaction id.
  external_ref    text,
  method_note     text,

  paid_at         timestamptz,
  recorded_by     uuid REFERENCES users(id),
  requested_by    uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  waived_reason   text,

  CHECK (status <> 'paid' OR paid_at IS NOT NULL),
  CHECK (status <> 'waived' OR waived_reason IS NOT NULL)
);

CREATE INDEX ON payments (request_id, created_at);
CREATE INDEX ON payments (status) WHERE status IN ('requested', 'pending');
CREATE INDEX ON payments (due_on) WHERE status = 'requested';

CREATE TABLE payment_events (
  id          bigserial PRIMARY KEY,
  payment_id  uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  from_status payment_status,
  to_status   payment_status NOT NULL,
  note        text,
  actor_id    uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON payment_events (payment_id, occurred_at DESC);

-- Keeping the deposit row in step with its payment, so the deposit
-- view stays truthful without anyone updating two places.
CREATE OR REPLACE FUNCTION payment_updates_deposit()
RETURNS trigger AS $$
BEGIN
  IF NEW.deposit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    UPDATE event_deposits
       SET amount_paid = NEW.amount,
           paid_on = coalesce(NEW.paid_at::date, CURRENT_DATE),
           updated_at = now()
     WHERE id = NEW.deposit_id;
  ELSIF NEW.status = 'waived' THEN
    UPDATE event_deposits
       SET waived = true,
           waived_reason = NEW.waived_reason,
           updated_at = now()
     WHERE id = NEW.deposit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_syncs_deposit
  AFTER INSERT OR UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_updates_deposit();

-- What is owed, across everything.
CREATE VIEW payments_outstanding AS
SELECT
  p.id,
  p.reference_code,
  p.request_id,
  r.reference_code AS event_reference,
  r.event_name,
  r.event_date,
  r.department_org,
  p.purpose,
  p.amount,
  p.due_on,
  (p.due_on - CURRENT_DATE) AS days_remaining,
  p.status,
  cd.classification
FROM payments p
JOIN event_requests r ON r.id = p.request_id
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
WHERE p.status IN ('requested', 'pending')
  AND r.status NOT IN ('cancelled', 'denied')
ORDER BY p.due_on NULLS LAST;

-- Whether a processor is connected. Read by the application so the
-- interface can be honest about what it can and cannot do, rather
-- than showing a pay button that goes nowhere.
CREATE TABLE payment_config (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider          payment_provider NOT NULL DEFAULT 'manual',
  online_enabled    boolean NOT NULL DEFAULT false,
  offline_instructions text NOT NULL DEFAULT
    'Payments are handled by the events office. Contact us on 641.628.5788 or catering@central.edu to arrange payment by cheque, transfer, or departmental journal entry.',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_config (id) VALUES (true) ON CONFLICT DO NOTHING;
