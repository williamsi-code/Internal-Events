import { query, one } from './db';

/**
 * Public information pages.
 *
 * The menu here reads as a menu, not a price list. Choices are shown
 * as prose - "bacon or sausage" - because someone browsing wants to
 * know what they can have, not to fill in a form. The form comes at
 * ordering time, and both are built from the same rows, so they
 * cannot drift apart.
 */

export interface PublicMenuRow {
  id: string;
  category: string;
  category_description: string | null;
  category_sort: number;
  name: string;
  description: string | null;
  unit: string;
  minimum_quantity: number | null;
  allergen_notes: string | null;
  sort_order: number;
  internal_price: string | null;
  affiliated_price: string | null;
  external_price: string | null;
  /** "Meat: bacon or sausage" style, built from the choice groups. */
  choices: string[];
}

export async function listPublicMenu() {
  const rows = await query<Omit<PublicMenuRow, 'choices'> & {
    choice_labels: string[] | null;
  }>(
    `SELECT mi.id,
            c.name AS category,
            c.description AS category_description,
            c.sort_order AS category_sort,
            mi.name, mi.description, mi.unit,
            mi.minimum_quantity, mi.allergen_notes, mi.sort_order,
            max(p.unit_price) FILTER (WHERE p.path='internal_non_revenue')::text
              AS internal_price,
            max(p.unit_price) FILTER (WHERE p.path='affiliated_cost_recovery')::text
              AS affiliated_price,
            max(p.unit_price) FILTER (WHERE p.path='external_commercial')::text
              AS external_price,
            (SELECT array_agg(line ORDER BY sort_order)
               FROM (
                 SELECT g.sort_order,
                        g.label || ': ' || string_agg(o.label, ', '
                          ORDER BY o.sort_order) AS line
                   FROM menu_choice_groups g
                   JOIN menu_choice_options o
                     ON o.group_id = g.id AND o.is_active
                  WHERE g.menu_item_id = mi.id
                    AND o.price_delta = 0
                  GROUP BY g.id, g.label, g.sort_order
               ) t
            ) AS choice_labels
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
       LEFT JOIN menu_item_prices p
              ON p.menu_item_id = mi.id
             AND p.effective_from <= CURRENT_DATE
             AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
      WHERE mi.is_active AND c.is_active
      GROUP BY mi.id, c.name, c.description, c.sort_order
      ORDER BY c.sort_order, mi.sort_order, mi.name`
  );

  return rows.map((r) => ({
    ...r,
    choices: r.choice_labels ?? [],
  }));
}

export interface PublicEventType {
  category: string;
  name: string;
  default_classification: string | null;
  always_review: boolean;
  guidance: string | null;
}

export async function listPublicEventTypes() {
  return query<PublicEventType>(
    `SELECT category, name, default_classification::text,
            always_review, guidance
       FROM event_types
      WHERE is_active
      ORDER BY category, sort_order, name`
  );
}

export interface ContentPage {
  slug: string;
  title: string;
  intro: string | null;
  body: string;
  updated_at: string;
}

export async function getContentPage(slug: string) {
  return one<ContentPage>(
    `SELECT slug, title, intro, body,
            to_char(updated_at, 'Mon FMDD, YYYY') AS updated_at
       FROM content_pages
      WHERE slug = $1 AND is_published`,
    [slug]
  );
}
