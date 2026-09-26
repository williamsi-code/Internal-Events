import { query, one } from './db';

/**
 * Customers.
 *
 * event_requests already carries a name and an email, which works
 * for one event and fails at the second: the same church booking
 * three times a year is three unconnected rows, and nobody can see
 * they are a regular until they mention it.
 */

export interface CustomerSummary {
  id: string;
  kind: string;
  name: string;
  trading_name: string | null;
  primary_contact: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  events: number;
  events_this_year: number;
  lifetime_value: string;
  value_this_year: string;
  last_event: string | null;
  next_event: string | null;
  cancellations: number;
  is_active: boolean;
}

const SUMMARY_COLUMNS = `
  c.id, c.kind::text, c.name, c.trading_name, c.is_active,
  ct.full_name AS primary_contact,
  ct.email::text AS primary_email,
  ct.phone AS primary_phone,
  coalesce(h.events, 0)::int AS events,
  coalesce(h.events_this_year, 0)::int AS events_this_year,
  coalesce(h.lifetime_value, 0)::text AS lifetime_value,
  coalesce(h.value_this_year, 0)::text AS value_this_year,
  to_char(h.last_event, 'Mon FMDD, YYYY') AS last_event,
  to_char(h.next_event, 'Mon FMDD, YYYY') AS next_event,
  coalesce(h.cancellations, 0)::int AS cancellations
`;

const SUMMARY_JOINS = `
  LEFT JOIN customer_contacts ct
         ON ct.customer_id = c.id AND ct.is_primary
  LEFT JOIN customer_history h ON h.id = c.id
`;

export async function listCustomers() {
  return query<CustomerSummary>(
    `SELECT ${SUMMARY_COLUMNS}
       FROM customers c ${SUMMARY_JOINS}
      ORDER BY c.is_active DESC, h.next_event NULLS LAST, c.name`
  );
}

export interface Customer extends CustomerSummary {
  billing_address: string | null;
  billing_email: string | null;
  billing_account: string | null;
  tax_exempt: boolean;
  tax_exempt_ref: string | null;
  notes: string | null;
  dietary_notes: string | null;
  access_notes: string | null;
  created_at: string;
}

export async function getCustomer(id: string) {
  return one<Customer>(
    `SELECT ${SUMMARY_COLUMNS},
            c.billing_address, c.billing_email::text, c.billing_account,
            c.tax_exempt, c.tax_exempt_ref,
            c.notes, c.dietary_notes, c.access_notes,
            to_char(c.created_at, 'Mon FMDD, YYYY') AS created_at
       FROM customers c ${SUMMARY_JOINS}
      WHERE c.id = $1`,
    [id]
  );
}

export interface Contact {
  id: string;
  full_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  has_account: boolean;
}

export async function getContacts(customerId: string) {
  return query<Contact>(
    `SELECT ct.id, ct.full_name, ct.role, ct.email::text, ct.phone,
            ct.is_primary, ct.notes,
            (ct.user_id IS NOT NULL) AS has_account
       FROM customer_contacts ct
      WHERE ct.customer_id = $1
      ORDER BY ct.is_primary DESC, ct.full_name`,
    [customerId]
  );
}

export interface CustomerEvent {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  status: string;
  classification: string | null;
  attendance: number;
  space_name: string | null;
  charged: string;
  is_past: boolean;
}

export async function getCustomerEvents(customerId: string) {
  return query<CustomerEvent>(
    `SELECT r.id, r.reference_code, r.event_name,
            to_char(r.event_date, 'Mon FMDD, YYYY') AS event_date,
            r.status::text,
            cd.classification::text,
            coalesce(r.actual_attendance, r.final_attendance,
                     r.estimated_attendance) AS attendance,
            s.name AS space_name,
            quoted_total(r.id)::text AS charged,
            (r.event_date < CURRENT_DATE) AS is_past
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
      WHERE r.customer_id = $1
      ORDER BY r.event_date DESC`,
    [customerId]
  );
}

/** Events with no customer attached, grouped by how they signed. The
 *  list that turns eighteen months of history into a customer base. */
export async function listUnlinkedEvents() {
  return query<{
    department_org: string;
    contact_email: string;
    requester_name: string;
    events: number;
    total: string;
    last_event: string;
    sample_id: string;
  }>(
    `SELECT r.department_org, r.contact_email::text,
            min(r.requester_name) AS requester_name,
            count(*)::int AS events,
            coalesce(sum(quoted_total(r.id)), 0)::text AS total,
            to_char(max(r.event_date), 'Mon FMDD, YYYY') AS last_event,
            min(r.id::text) AS sample_id
       FROM event_requests r
      WHERE r.customer_id IS NULL
        AND r.status NOT IN ('draft', 'denied')
      GROUP BY r.department_org, r.contact_email
      ORDER BY count(*) DESC, max(r.event_date) DESC
      LIMIT 100`
  );
}

export async function getCustomerSummary() {
  return one<{
    total: number;
    active: number;
    unlinked_events: number;
    repeat_customers: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM customers) AS total,
       (SELECT count(*)::int FROM customers WHERE is_active) AS active,
       (SELECT count(*)::int FROM event_requests
         WHERE customer_id IS NULL
           AND status NOT IN ('draft', 'denied')) AS unlinked_events,
       (SELECT count(*)::int FROM customer_history WHERE events > 1)
         AS repeat_customers`
  );
}
