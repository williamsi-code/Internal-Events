import { query, one } from './db';
import type { Classification } from './classify';

/**
 * Public information pages.
 *
 * Spaces, menu, and classification are generated from the same tables
 * the request workflow uses, so a price change or a new event type
 * appears here immediately rather than drifting out of date the way a
 * separately maintained page would.
 */

export interface PublicSpace {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean;
  description: string | null;
}

export async function listPublicSpaces() {
  return query<PublicSpace>(
    `SELECT id, name, building, capacity_seated, capacity_standing,
            supports_catering, description
       FROM spaces
      WHERE is_active
      ORDER BY sort_order, name`
  );
}

export interface PublicMenuItem {
  category: string;
  category_description: string | null;
  name: string;
  description: string | null;
  unit: string;
  minimum_quantity: number | null;
  allergen_notes: string | null;
  internal_price: string | null;
  affiliated_price: string | null;
  external_price: string | null;
}

/** All three published tiers side by side, so a requester can see what
 *  their event would cost before they know how it will be classified. */
export async function listPublicMenu() {
  return query<PublicMenuItem>(
    `SELECT c.name AS category, c.description AS category_description,
            mi.name, mi.description, mi.unit,
            mi.minimum_quantity, mi.allergen_notes,
            max(mip.unit_price) FILTER (WHERE mip.path = 'internal_non_revenue')::text
              AS internal_price,
            max(mip.unit_price) FILTER (WHERE mip.path = 'affiliated_cost_recovery')::text
              AS affiliated_price,
            max(mip.unit_price) FILTER (WHERE mip.path = 'external_commercial')::text
              AS external_price
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
       LEFT JOIN menu_item_prices mip
              ON mip.menu_item_id = mi.id
             AND mip.effective_from <= CURRENT_DATE
             AND (mip.effective_to IS NULL OR mip.effective_to > CURRENT_DATE)
      WHERE mi.is_active AND c.is_active
      GROUP BY c.name, c.description, c.sort_order, mi.name, mi.description,
               mi.unit, mi.minimum_quantity, mi.allergen_notes, mi.sort_order
      ORDER BY c.sort_order, mi.sort_order`
  );
}

export interface PublicEventType {
  category: string;
  name: string;
  default_classification: Classification | null;
  default_pricing: string | null;
  always_review: boolean;
  guidance: string | null;
}

/** The classification matrix, published so requesters can predict the
 *  answer rather than being surprised by it. */
export async function listPublicEventTypes() {
  return query<PublicEventType>(
    `SELECT c.name AS category, et.name,
            et.default_classification, et.default_pricing,
            et.always_review, et.guidance
       FROM event_types et
       JOIN event_type_categories c ON c.id = et.category_id
      WHERE et.is_active
      ORDER BY c.sort_order, et.sort_order`
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
            to_char(updated_at, 'FMMonth FMDD, YYYY') AS updated_at
       FROM content_pages
      WHERE slug = $1 AND is_published`,
    [slug]
  );
}
