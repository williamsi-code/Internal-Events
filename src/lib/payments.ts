import { query, one } from './db';

/**
 * Payments.
 *
 * No processor is connected. Everything here records payments that
 * happen offline, with `payment_config.online_enabled` as the switch
 * that turns a real checkout on once there is one to turn on.
 *
 * The interface reads that flag rather than assuming, so nobody is
 * shown a pay button that cannot take their money.
 */

export interface PaymentConfig {
  provider: string;
  online_enabled: boolean;
  offline_instructions: string;
}

export async function getPaymentConfig() {
  return one<PaymentConfig>(
    `SELECT provider::text, online_enabled, offline_instructions
       FROM payment_config WHERE id`
  );
}

export interface Payment {
  id: string;
  reference_code: string;
  purpose: string;
  amount: string;
  due_on: string | null;
  days_remaining: number | null;
  status: string;
  provider: string;
  external_ref: string | null;
  method_note: string | null;
  paid_at: string | null;
  recorded_by_name: string | null;
  waived_reason: string | null;
  created_at: string;
}

export async function getPayments(requestId: string) {
  return query<Payment>(
    `SELECT p.id, p.reference_code, p.purpose, p.amount::text,
            to_char(p.due_on, 'Mon FMDD, YYYY') AS due_on,
            (p.due_on - CURRENT_DATE) AS days_remaining,
            p.status::text, p.provider::text,
            p.external_ref, p.method_note,
            to_char(p.paid_at, 'Mon FMDD, YYYY') AS paid_at,
            u.full_name AS recorded_by_name,
            p.waived_reason,
            to_char(p.created_at, 'Mon FMDD, YYYY') AS created_at
       FROM payments p
       LEFT JOIN users u ON u.id = p.recorded_by
      WHERE p.request_id = $1
      ORDER BY p.created_at`,
    [requestId]
  );
}

export interface OutstandingPayment {
  id: string;
  reference_code: string;
  request_id: string;
  event_reference: string;
  event_name: string;
  event_date: string;
  department_org: string;
  purpose: string;
  amount: string;
  due_on: string | null;
  days_remaining: number | null;
  status: string;
  classification: string | null;
}

export async function listOutstandingPayments() {
  return query<OutstandingPayment>(
    `SELECT id, reference_code, request_id, event_reference, event_name,
            to_char(event_date, 'YYYY-MM-DD') AS event_date,
            department_org, purpose, amount::text,
            to_char(due_on, 'Mon FMDD') AS due_on,
            days_remaining, status::text, classification::text
       FROM payments_outstanding`
  );
}

/** What the requester is told to do, given no processor. */
export interface PaymentSummary {
  total_due: string;
  total_paid: string;
  outstanding: string;
  count_outstanding: number;
}

export async function getPaymentSummary(requestId: string) {
  return one<PaymentSummary>(
    `SELECT
       coalesce(sum(amount), 0)::text AS total_due,
       coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)::text
         AS total_paid,
       coalesce(sum(amount) FILTER (WHERE status IN ('requested','pending')), 0)::text
         AS outstanding,
       count(*) FILTER (WHERE status IN ('requested','pending'))
         AS count_outstanding
       FROM payments WHERE request_id = $1`,
    [requestId]
  );
}
