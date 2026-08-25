import { one, query } from './db';

/**
 * The catering sheet: everything the kitchen needs to produce an event,
 * pulled from data already captured elsewhere. Read-only by design -
 * nothing is edited here, because a sheet that can be edited is a sheet
 * that disagrees with the record.
 */

export interface CateringSheet {
  reference_code: string;
  event_name: string;
  event_purpose: string;
  event_date: string;
  event_date_long: string;
  start_time: string | null;
  end_time: string | null;
  space_name: string | null;
  space_building: string | null;
  location_freetext: string | null;
  estimated_attendance: number;
  final_attendance: number | null;
  headcount_due_on: string | null;

  requester_name: string;
  department_org: string;
  contact_email: string;
  contact_phone: string | null;

  classification: string | null;
  budget_account: string | null;
  outside_org_name: string | null;

  service_expectations: string | null;
  room_setup: string | null;
  equipment: string | null;
  technology: string | null;
  special_requests: string | null;
  dietary_restrictions: string | null;

  status: string;
  confirmed_on: string | null;
  printed_for: string;
}

export async function getCateringSheet(requestId: string) {
  return one<CateringSheet>(
    `SELECT r.reference_code, r.event_name, r.event_purpose,
            to_char(r.event_date, 'YYYY-MM-DD') AS event_date,
            to_char(r.event_date, 'FMDay, FMMonth FMDD, YYYY') AS event_date_long,
            to_char(r.start_time, 'FMHH12:MI AM') AS start_time,
            to_char(r.end_time, 'FMHH12:MI AM') AS end_time,
            s.name AS space_name, s.building AS space_building,
            r.location_freetext,
            r.estimated_attendance, r.final_attendance,
            to_char(r.headcount_due_on, 'Mon FMDD') AS headcount_due_on,
            r.requester_name, r.department_org,
            r.contact_email, r.contact_phone,
            cd.classification,
            f.budget_account, f.outside_org_name,
            req.service_expectations, req.room_setup, req.equipment,
            req.technology, req.special_requests, req.dietary_restrictions,
            r.status,
            to_char(r.final_reviewed_at, 'Mon FMDD, YYYY') AS confirmed_on,
            to_char(now(), 'Mon FMDD, YYYY at FMHH12:MI AM') AS printed_for
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
       LEFT JOIN event_funding f ON f.request_id = r.id
       LEFT JOIN event_requirements req ON req.request_id = r.id
      WHERE r.id = $1`,
    [requestId]
  );
}

export interface SheetLine {
  category: string;
  name: string;
  description: string | null;
  unit: string;
  allergen_notes: string | null;
  quantity: number;
  unit_price_quoted: string;
  line_total: string;
  notes: string | null;
}

export async function getCateringLines(requestId: string) {
  return query<SheetLine>(
    `SELECT c.name AS category, mi.name, mi.description, mi.unit,
            mi.allergen_notes, sel.quantity,
            sel.unit_price_quoted::text,
            (sel.quantity * sel.unit_price_quoted)::text AS line_total,
            sel.notes
       FROM request_menu_selections sel
       JOIN menu_items mi ON mi.id = sel.menu_item_id
       JOIN menu_categories c ON c.id = mi.category_id
      WHERE sel.request_id = $1
      ORDER BY c.sort_order, mi.sort_order`,
    [requestId]
  );
}
