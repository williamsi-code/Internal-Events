import { one } from './db';

/**
 * What staff need to classify an event.
 *
 * There is no advisory verdict any more. The matrix questions were
 * asked of people who had not read the policy, and their guesses
 * were never what got recorded. Staff read what the event is and
 * who is paying, and decide.
 *
 * The one genuinely useful automatic thing is what this requester
 * was classified as last time, because consistency is what people
 * notice and complain about.
 */

export interface ClassificationContext {
  request_id: string;
  reference_code: string;
  event_name: string;
  event_description: string | null;
  department_org: string;
  contact_email: string;
  requester_name: string;
  event_type_name: string | null;
  type_hint: string | null;
  event_type_other: string | null;

  budget_account: string | null;
  outside_org_name: string | null;
  outside_funding: boolean | null;
  outside_funding_detail: string | null;
  revenue_collected: boolean | null;
  revenue_recipient: string | null;
  financial_risk_bearer: string | null;

  requester_notes: string | null;

  previous_classification: string | null;
  previous_events: number;

  submitted_complete: boolean;
  menu_lines: number;
  awaiting_reprice: number;
}

export async function getClassificationContext(requestId: string) {
  return one<ClassificationContext>(
    'SELECT * FROM classification_context WHERE request_id = $1',
    [requestId]
  );
}

export interface PriceChange {
  quoted_at_intake: string;
  charged_now: string;
  saved: string;
  classification: string | null;
}

export async function getPriceChange(requestId: string) {
  return one<PriceChange>(
    `SELECT quoted_at_intake::text, charged_now::text,
            saved::text, classification
       FROM price_change_summary($1)`,
    [requestId]
  );
}
