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

export async function getChoiceGroups() {
  const rows = await query<
    ChoiceGroup & { option_id: string; option_label: string;
                    option_delta: string; option_note: string | null }
  >(
    `SELECT g.id, g.menu_item_id, g.label, g.help_text,
            g.min_select, g.max_select, g.quantity_mode::text,
            g.sort_order,
            o.id AS option_id, o.label AS option_label,
            o.price_delta::text AS option_delta, o.note AS option_note
       FROM menu_choice_groups g
       JOIN menu_items mi ON mi.id = g.menu_item_id AND mi.is_active
       LEFT JOIN menu_choice_options o
              ON o.group_id = g.id AND o.is_active
      ORDER BY g.menu_item_id, g.sort_order, o.sort_order`
  );

  const groups = new Map<string, ChoiceGroup>();
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
    }
    if (r.option_id) {
      groups.get(r.id)!.options.push({
        id: r.option_id,
        group_id: r.id,
        label: r.option_label,
        price_delta: r.option_delta,
        note: r.option_note,
      });
    }
  }

  // Keyed by menu item, because that is how the form needs it.
  const byItem = new Map<string, ChoiceGroup[]>();
  for (const g of groups.values()) {
    if (!byItem.has(g.menu_item_id)) byItem.set(g.menu_item_id, []);
    byItem.get(g.menu_item_id)!.push(g);
  }
  return byItem;
}

export interface SavedChoice {
  selection_id: string;
  option_id: string;
  group_label: string;
  option_label: string;
  quantity: number | null;
  price_delta: string;
}

export async function getSelectionChoices(requestId: string) {
  return query<SavedChoice>(
    `SELECT sc.selection_id, sc.option_id,
            g.label AS group_label, o.label AS option_label,
            sc.quantity, o.price_delta::text
       FROM selection_choices sc
       JOIN request_menu_selections sel ON sel.id = sc.selection_id
       JOIN menu_choice_options o ON o.id = sc.option_id
       JOIN menu_choice_groups g ON g.id = o.group_id
      WHERE sel.request_id = $1
      ORDER BY g.sort_order, o.sort_order`,
    [requestId]
  );
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
