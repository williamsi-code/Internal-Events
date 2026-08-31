import { query, one } from './db';

/**
 * Enquiries.
 *
 * A conversation rather than a form submission. Status follows the
 * last message in the thread, so it cannot drift from what the
 * conversation actually shows.
 */

export interface EnquirySummary {
  id: string;
  reference_code: string;
  name: string;
  email: string;
  organization: string | null;
  event_type: string | null;
  approx_date: string | null;
  approx_guests: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  days_since_activity: number;
  unread_from_them: number;
}

export async function listOpenEnquiries() {
  return query<EnquirySummary>(
    `SELECT id, reference_code, name, email, organization, event_type,
            to_char(approx_date, 'Mon FMDD, YYYY') AS approx_date,
            approx_guests, status::text,
            to_char(created_at, 'Mon FMDD, YYYY') AS created_at,
            to_char(updated_at, 'Mon FMDD, YYYY') AS updated_at,
            days_since_activity, unread_from_them
       FROM enquiries_open`
  );
}

export interface MyEnquiry {
  id: string;
  reference_code: string;
  event_type: string | null;
  approx_date: string | null;
  status: string;
  created_at: string;
  awaiting_you: boolean;
  unread: number;
}

export async function listMyEnquiries(userId: string) {
  return query<MyEnquiry>(
    `SELECT e.id, e.reference_code, e.event_type,
            to_char(e.approx_date, 'Mon FMDD, YYYY') AS approx_date,
            e.status::text,
            to_char(e.created_at, 'Mon FMDD, YYYY') AS created_at,
            (e.status = 'answered') AS awaiting_you,
            (SELECT count(*) FROM enquiry_messages m
              WHERE m.enquiry_id = e.id
                AND m.is_staff AND NOT m.is_internal
                AND m.read_at IS NULL) AS unread
       FROM enquiries e
      WHERE e.user_id = $1
      ORDER BY e.updated_at DESC`,
    [userId]
  );
}

export interface EnquiryDetail {
  id: string;
  reference_code: string;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  event_type: string | null;
  approx_date: string | null;
  approx_guests: number | null;
  status: string;
  user_id: string | null;
  converted_request_id: string | null;
  created_at: string;
}

export async function getEnquiry(id: string) {
  return one<EnquiryDetail>(
    `SELECT id, reference_code, name, email, phone, organization,
            event_type,
            to_char(approx_date, 'Mon FMDD, YYYY') AS approx_date,
            approx_guests, status::text, user_id, converted_request_id,
            to_char(created_at, 'Mon FMDD, YYYY') AS created_at
       FROM enquiries WHERE id = $1`,
    [id]
  );
}

export interface EnquiryMessage {
  id: string;
  body: string;
  is_staff: boolean;
  is_internal: boolean;
  author_name: string | null;
  created_at: string;
}

export async function getEnquiryMessages(
  enquiryId: string,
  includeInternal: boolean
) {
  return query<EnquiryMessage>(
    `SELECT m.id, m.body, m.is_staff, m.is_internal,
            u.full_name AS author_name,
            to_char(m.created_at, 'Mon FMDD at FMHH12:MI AM') AS created_at
       FROM enquiry_messages m
       LEFT JOIN users u ON u.id = m.author_id
      WHERE m.enquiry_id = $1
        AND ($2::boolean OR NOT m.is_internal)
      ORDER BY m.created_at`,
    [enquiryId, includeInternal]
  );
}
