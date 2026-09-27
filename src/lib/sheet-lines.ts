import { query, one } from './db';

/**
 * The catering sheet.
 *
 * One line per thing to make. An order split across varieties is
 * several lines, because fifteen beef and fifteen turkey is two
 * things to cook and the kitchen needs them apart.
 */

export interface SheetLine {
  selection_id: string;
  menu_item_id: string;
  item_name: string;
  variety: string | null;
  category_name: string;
  revenue_category: string;
  quantity: string;
  unit: string;
  unit_price: string;
  line_total: string;
  notes: string | null;
  sort_order: number;
  is_variety: boolean;
}

export async function getSheetLinesFor(requestId: string) {
  return query<SheetLine>('SELECT * FROM sheet_lines_for($1)', [requestId]);
}

export interface RevenueLine {
  category: string;
  amount: string;
}

export const REVENUE_LABEL: Record<string, string> = {
  food: 'Food',
  beverage: 'Beverage',
  alcohol: 'Alcohol',
  room_rental: 'Room rental',
  labor: 'Labor',
  equipment_rental: 'Equipment rental',
  delivery: 'Delivery',
  other: 'Other',
};

export async function getRevenueBreakdown(requestId: string) {
  return query<RevenueLine>(
    'SELECT category, amount::text FROM revenue_breakdown($1)',
    [requestId]
  );
}

export async function getRevenueByCategory(from: string, to: string) {
  return query<{
    category: string;
    amount: string;
    events: number;
    share: string;
  }>(
    `SELECT category, amount::text, events, share::text
       FROM revenue_by_category($1::date, $2::date)`,
    [from, to]
  );
}

/** Choices that are not a split — dressings, breads, a drink — shown
 *  as a note under the line they belong to. */
export async function getLineNotes(requestId: string) {
  return query<{
    selection_id: string;
    group_label: string;
    choice: string;
    count: string | null;
  }>(
    `SELECT sc.selection_id, g.label AS group_label,
            o.label AS choice, sc.quantity::text AS count
       FROM request_menu_selections sel
       JOIN selection_choices sc ON sc.selection_id = sel.id
       JOIN menu_choice_options o ON o.id = sc.option_id
       JOIN menu_choice_groups g ON g.id = o.group_id
      WHERE sel.request_id = $1
        AND (g.quantity_mode <> 'per_option' OR g.label = 'Drink')
      ORDER BY g.sort_order, o.sort_order`,
    [requestId]
  );
}
