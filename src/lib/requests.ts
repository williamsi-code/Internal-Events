import { query, one } from './db';
import type { Classification } from './classify';

export interface QueueRow {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  estimated_attendance: number;
  department_org: string;
  requester_name: string;
  status: string;
  submitted_at: string | null;
  event_type_name: string | null;
  event_type_other: string | null;
  default_classification: Classification | null;
  always_review: boolean | null;
  suggested_class: Classification | null;
  deviates_from_type: boolean;
  current_classification: Classification | null;
  unread_replies: number;
  headcount_due_on: string | null;
  days_to_headcount: number | null;
  headcount_submitted_at: string | null;
  final_attendance: number | null;
}

/** Everything the queue needs, in one round trip. */
export async function listRequests(): Promise<QueueRow[]> {
  return query<QueueRow>(`
    SELECT r.id, r.reference_code, r.event_name,
           to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
           r.estimated_attendance, r.department_org, r.requester_name,
           r.status, r.submitted_at,
           et.name AS event_type_name, r.event_type_other,
           et.default_classification, et.always_review,
           ca.suggested_class, ca.deviates_from_type,
           cd.classification AS current_classification,
           (SELECT count(*) FROM request_messages m
             WHERE m.request_id = r.id
               AND NOT m.is_internal
               AND m.author_id = r.requester_id
               AND m.read_at IS NULL) AS unread_replies
      FROM event_requests r
      LEFT JOIN event_types et ON et.id = r.event_type_id
      LEFT JOIN classification_answers ca ON ca.request_id = r.id
      LEFT JOIN classification_decisions cd
             ON cd.request_id = r.id AND cd.is_current
     WHERE r.status <> 'draft'
     ORDER BY r.event_date
  `);
}

export interface RequestDetail extends QueueRow {
  requester_id: string;
  contact_email: string;
  contact_phone: string | null;
  event_purpose: string;
  start_time: string | null;
  end_time: string | null;
  space_name: string | null;
  space_building: string | null;
  location_freetext: string | null;
  type_guidance: string | null;
  deviation_detail: string | null;
  suggested_rationale: string | null;

  food_needs: string | null;
  service_expectations: string | null;
  room_setup: string | null;
  equipment: string | null;
  technology: string | null;
  special_requests: string | null;
  dietary_restrictions: string | null;

  budget_account: string | null;
  outside_org_name: string | null;
  outside_org_involved: boolean;
  outside_funding: boolean;
  outside_funding_detail: string | null;
  revenue_collected: boolean;
  revenue_recipient: string | null;
  financial_risk_bearer: string | null;

  official_business: string;
  event_owner: string;
  primary_beneficiary: string;
  primary_payer: string;
  would_occur_without: string;
  requester_notes: string | null;

  decision_rationale: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  details_confirmed_at: string | null;
}

export async function getRequest(id: string) {
  return one<RequestDetail>(
    `
    SELECT r.id, r.reference_code, r.event_name,
           to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
           r.estimated_attendance, r.department_org, r.requester_name,
           r.requester_id, r.contact_email, r.contact_phone,
           r.event_purpose, r.status, r.submitted_at,
           to_char(r.start_time, 'HH24:MI') AS start_time,
           to_char(r.end_time, 'HH24:MI') AS end_time,
           r.location_freetext, r.event_type_other,
           s.name AS space_name, s.building AS space_building,
           et.name AS event_type_name, et.default_classification,
           et.always_review, et.guidance AS type_guidance,

           req.food_needs, req.service_expectations, req.room_setup,
           req.equipment, req.technology, req.special_requests,
           req.dietary_restrictions,

           f.budget_account, f.outside_org_name, f.outside_org_involved,
           f.outside_funding, f.outside_funding_detail, f.revenue_collected,
           f.revenue_recipient, f.financial_risk_bearer,

           ca.official_business, ca.event_owner, ca.primary_beneficiary,
           ca.primary_payer, ca.would_occur_without, ca.requester_notes,
           ca.suggested_class, ca.suggested_rationale,
           ca.deviates_from_type, ca.deviation_detail,

           cd.classification AS current_classification,
           cd.rationale AS decision_rationale,
           du.full_name AS decided_by_name,
           to_char(cd.decided_at, 'Mon DD, YYYY') AS decided_at,
           to_char(r.details_confirmed_at, 'Mon DD, YYYY') AS details_confirmed_at,
           0 AS unread_replies
      FROM event_requests r
      LEFT JOIN spaces s ON s.id = r.space_id
      LEFT JOIN event_types et ON et.id = r.event_type_id
      LEFT JOIN event_requirements req ON req.request_id = r.id
      LEFT JOIN event_funding f ON f.request_id = r.id
      LEFT JOIN classification_answers ca ON ca.request_id = r.id
      LEFT JOIN classification_decisions cd
             ON cd.request_id = r.id AND cd.is_current
      LEFT JOIN users du ON du.id = cd.decided_by
     WHERE r.id = $1
  `,
    [id]
  );
}

export interface Message {
  id: string;
  body: string;
  is_internal: boolean;
  author_name: string;
  is_staff: boolean;
  created_at: string;
}

export async function getMessages(requestId: string) {
  return query<Message>(
    `SELECT m.id, m.body, m.is_internal, u.full_name AS author_name,
            (m.author_id <> r.requester_id) AS is_staff,
            to_char(m.created_at, 'Mon DD, HH12:MI AM') AS created_at
       FROM request_messages m
       JOIN users u ON u.id = m.author_id
       JOIN event_requests r ON r.id = m.request_id
      WHERE m.request_id = $1
      ORDER BY m.created_at`,
    [requestId]
  );
}

/* ------------------------------------------------------------
   Requester-facing queries. These deliberately never expose
   internal notes, staff identities beyond the decision author,
   or anything from sections F onward.
   ------------------------------------------------------------ */

export interface MyRequestRow {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  status: string;
  estimated_attendance: number;
  current_classification: Classification | null;
  acknowledged_at: string | null;
  awaiting_you: boolean;
}

export async function listMyRequests(userId: string) {
  return query<MyRequestRow>(
    `SELECT r.id, r.reference_code, r.event_name,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            r.status, r.estimated_attendance,
            cd.classification AS current_classification,
            to_char(cd.acknowledged_at, 'Mon DD, YYYY') AS acknowledged_at,
            (r.status = 'info_requested'
             OR (cd.classification IS NOT NULL
                 AND cd.acknowledged_at IS NULL)) AS awaiting_you
       FROM event_requests r
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
      WHERE r.requester_id = $1 AND r.status <> 'draft'
      ORDER BY r.event_date`,
    [userId]
  );
}

export interface MyRequestDetail {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  estimated_attendance: number;
  event_purpose: string;
  status: string;
  space_name: string | null;
  space_building: string | null;
  location_freetext: string | null;
  event_type_name: string | null;
  event_type_other: string | null;
  decision_id: string | null;
  current_classification: Classification | null;
  decision_rationale: string | null;
  decided_at: string | null;
  acknowledged_at: string | null;
  details_confirmed_at: string | null;
  headcount_due_on: string | null;
  days_to_headcount: number | null;
  headcount_submitted_at: string | null;
  final_attendance: number | null;
}

export async function getMyRequest(id: string, userId: string) {
  return one<MyRequestDetail>(
    `SELECT r.id, r.reference_code, r.event_name,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            to_char(r.start_time, 'HH24:MI') AS start_time,
            to_char(r.end_time, 'HH24:MI') AS end_time,
            r.estimated_attendance, r.event_purpose, r.status,
            r.location_freetext, r.event_type_other,
            s.name AS space_name, s.building AS space_building,
            et.name AS event_type_name,
            cd.id AS decision_id,
            cd.classification AS current_classification,
            cd.rationale AS decision_rationale,
            to_char(cd.decided_at, 'Mon DD, YYYY') AS decided_at,
            to_char(cd.acknowledged_at, 'Mon DD, YYYY') AS acknowledged_at,
            to_char(r.details_confirmed_at, 'Mon DD, YYYY') AS details_confirmed_at,
            to_char(r.headcount_due_on, 'FMMonth FMDD') AS headcount_due_on,
            (r.headcount_due_on - CURRENT_DATE) AS days_to_headcount,
            to_char(r.headcount_submitted_at, 'Mon FMDD, YYYY') AS headcount_submitted_at,
            r.final_attendance
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN event_types et ON et.id = r.event_type_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
      WHERE r.id = $1 AND r.requester_id = $2`,
    [id, userId]
  );
}

/** Internal notes are filtered out in SQL, not in the component. */
export async function getVisibleMessages(requestId: string) {
  return query<Message>(
    `SELECT m.id, m.body, m.is_internal, u.full_name AS author_name,
            (m.author_id <> r.requester_id) AS is_staff,
            to_char(m.created_at, 'Mon DD, HH12:MI AM') AS created_at
       FROM request_messages m
       JOIN users u ON u.id = m.author_id
       JOIN event_requests r ON r.id = m.request_id
      WHERE m.request_id = $1 AND NOT m.is_internal
      ORDER BY m.created_at`,
    [requestId]
  );
}

/* ------------------------------------------------------------
   Menu and details step.
   ------------------------------------------------------------ */

export interface MenuItemRow {
  id: string;
  category: string;
  name: string;
  description: string | null;
  unit: string;
  minimum_quantity: number | null;
  allergen_notes: string | null;
  unit_price: string;
}

/** Resolves the price tier from the current classification, then
 *  returns the menu priced at that tier. Returns an empty list if the
 *  event is not yet classified - there is no correct price to show. */
export async function getMenuForRequest(requestId: string) {
  return query<MenuItemRow>(
    `WITH tier AS (
       SELECT CASE
                WHEN cd.classification = 'internal' AND f.revenue_collected
                  THEN cp.revenue_path
                ELSE cp.path
              END AS path
         FROM event_requests r
         JOIN classification_decisions cd
           ON cd.request_id = r.id AND cd.is_current
         JOIN classification_pricing cp
           ON cp.classification = cd.classification
         LEFT JOIN event_funding f ON f.request_id = r.id
        WHERE r.id = $1
     )
     SELECT mi.id, c.name AS category, mi.name, mi.description,
            mi.unit, mi.minimum_quantity, mi.allergen_notes,
            mip.unit_price::text
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
       JOIN menu_item_prices mip ON mip.menu_item_id = mi.id
       JOIN tier ON tier.path = mip.path
      WHERE mi.is_active AND c.is_active
        AND mip.effective_from <= CURRENT_DATE
        AND (mip.effective_to IS NULL OR mip.effective_to > CURRENT_DATE)
      ORDER BY c.sort_order, mi.sort_order`,
    [requestId]
  );
}

export interface SelectionRow {
  menu_item_id: string;
  quantity: number;
  unit_price_quoted: string;
  notes: string | null;
}

export async function getSelections(requestId: string) {
  return query<SelectionRow>(
    `SELECT menu_item_id, quantity, unit_price_quoted::text, notes
       FROM request_menu_selections
      WHERE request_id = $1`,
    [requestId]
  );
}

export interface DetailsState {
  status: string;
  classification: Classification | null;
  acknowledged_at: string | null;
  details_confirmed_at: string | null;
  estimated_attendance: number;
  room_setup: string | null;
  equipment: string | null;
  technology: string | null;
  special_requests: string | null;
  dietary_restrictions: string | null;
  service_expectations: string | null;
}

export async function getDetailsState(requestId: string, userId: string) {
  return one<DetailsState>(
    `SELECT r.status, r.estimated_attendance,
            to_char(r.details_confirmed_at, 'Mon DD, YYYY') AS details_confirmed_at,
            cd.classification,
            to_char(cd.acknowledged_at, 'Mon DD, YYYY') AS acknowledged_at,
            req.room_setup, req.equipment, req.technology,
            req.special_requests, req.dietary_restrictions,
            req.service_expectations
       FROM event_requests r
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
       LEFT JOIN event_requirements req ON req.request_id = r.id
      WHERE r.id = $1 AND r.requester_id = $2`,
    [requestId, userId]
  );
}

/* ------------------------------------------------------------
   Final headcount.
   ------------------------------------------------------------ */

export interface HeadcountDue {
  id: string;
  reference_code: string;
  event_name: string;
  event_date: string;
  headcount_due_on: string;
  days_remaining: number;
  estimated_attendance: number;
  requester_name: string;
  contact_email: string;
  department_org: string;
  classification: Classification | null;
}

/** Everything still owing a final count, soonest deadline first.
 *  Negative days_remaining means the deadline has passed. */
export async function listHeadcountOutstanding() {
  return query<HeadcountDue>(
    `SELECT id, reference_code, event_name,
            to_char(event_date, 'YYYY-MM-DD') AS event_date,
            to_char(headcount_due_on, 'Mon FMDD') AS headcount_due_on,
            days_remaining, estimated_attendance,
            requester_name, contact_email, department_org, classification
       FROM headcount_outstanding`
  );
}
