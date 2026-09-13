import { query } from './db';

/**
 * Choices on a menu item.
 *
 * The menu reads as prose; ordering needs a form. A group is one
 * question ("Meat"), its options are the answers, and max_select is
 * how many may be picked - which for a buffet is the number in
 * parentheses on the card.
 */

export interface ChoiceOption {
  id: string;
  group_id: string;
  label: string;
  price_delta: string;
  note: string | null;
}

export interface ChoiceGroup {
  id: string;
  menu_item_id: string;
  label: string;
  help_text: string | null;
  min_select: number;
  max_select: number;
  quantity_mode: 'none' | 'per_option';
  options: ChoiceOption[];
}

/** Keyed by menu item id, as a plain object: a Map does not survive
 *  the server-to-client boundary. */
export async function getChoiceGroups(): Promise<Record<string, ChoiceGroup[]>> {
  const rows = await query<{
    id: string;
    menu_item_id: string;
    label: string;
    help_text: string | null;
    min_select: number;
    max_select: number;
    quantity_mode: 'none' | 'per_option';
    option_id: string | null;
    option_label: string | null;
    option_delta: string | null;
    option_note: string | null;
  }>(
    `SELECT g.id, g.menu_item_id, g.label, g.help_text,
            g.min_select, g.max_select, g.quantity_mode::text,
            o.id AS option_id, o.label AS option_label,
            o.price_delta::text AS option_delta, o.note AS option_note
       FROM menu_choice_groups g
       JOIN menu_items mi ON mi.id = g.menu_item_id AND mi.is_active
       LEFT JOIN menu_choice_options o
              ON o.group_id = g.id AND o.is_active
      ORDER BY g.menu_item_id, g.sort_order, o.sort_order`
  );

  const groups = new Map<string, ChoiceGroup>();
  const order: string[] = [];

  for (const r of rows) {
    if (!groups.has(r.id)) {
      groups.set(r.id, {
        id: r.id,
        menu_item_id: r.menu_item_id,
        label: r.label,
        help_text: r.help_text,
        min_select: r.min_select,
        max_select: r.max_select,
        quantity_mode: r.quantity_mode,
        options: [],
      });
      order.push(r.id);
    }
    if (r.option_id) {
      groups.get(r.id)!.options.push({
        id: r.option_id,
        group_id: r.id,
        label: r.option_label!,
        price_delta: r.option_delta ?? '0',
        note: r.option_note,
      });
    }
  }

  const byItem: Record<string, ChoiceGroup[]> = {};
  for (const id of order) {
    const g = groups.get(id)!;
    if (!byItem[g.menu_item_id]) byItem[g.menu_item_id] = [];
    byItem[g.menu_item_id].push(g);
  }
  return byItem;
}

/** What was already chosen, in the shape the form holds it. */
export async function getSavedChoices(
  requestId: string
): Promise<Record<string, { optionId: string; quantity: number | null }[]>> {
  const rows = await query<{
    menu_item_id: string;
    option_id: string;
    quantity: number | null;
  }>(
    `SELECT sel.menu_item_id, sc.option_id, sc.quantity
       FROM selection_choices sc
       JOIN request_menu_selections sel ON sel.id = sc.selection_id
      WHERE sel.request_id = $1`,
    [requestId]
  );

  const out: Record<string, { optionId: string; quantity: number | null }[]> = {};
  for (const r of rows) {
    if (!out[r.menu_item_id]) out[r.menu_item_id] = [];
    out[r.menu_item_id].push({ optionId: r.option_id, quantity: r.quantity });
  }
  return out;
}

/** Choices in a form the catering sheet and the kitchen can read. */
export async function getChoicesForSheet(requestId: string) {
  return query<{
    menu_item: string;
    group_label: string;
    option_label: string;
    quantity: number | null;
  }>(
    `SELECT mi.name AS menu_item, g.label AS group_label,
            o.label AS option_label, sc.quantity
       FROM selection_choices sc
       JOIN request_menu_selections sel ON sel.id = sc.selection_id
       JOIN menu_items mi ON mi.id = sel.menu_item_id
       JOIN menu_choice_options o ON o.id = sc.option_id
       JOIN menu_choice_groups g ON g.id = o.group_id
      WHERE sel.request_id = $1
      ORDER BY mi.name, g.sort_order, o.sort_order`,
    [requestId]
  );
}
