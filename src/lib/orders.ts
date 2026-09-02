import { query } from './db';

/**
 * External ordering.
 *
 * The public menu is priced at external rates because that is the
 * published rate and the correct default for an outside customer.
 * It is also the highest tier, so a later reclassification can only
 * lower the price - the right direction for a surprise.
 */

export interface PublicMenuItem {
  id: string;
  category: string;
  category_sort: number;
  name: string;
  description: string | null;
  unit: string;
  minimum_quantity: number | null;
  allergen_notes: string | null;
  unit_price: string;
  sort_order: number;
}

export async function getPublicMenu() {
  return query<PublicMenuItem>(
    `SELECT id, category, category_sort, name, description, unit,
            minimum_quantity, allergen_notes, unit_price::text, sort_order
       FROM public_menu()`
  );
}

export interface OrderSpace {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean;
  facility_rate_external: string;
  rate_basis: string;
}

/** Only the spaces we host outside events in. Offering the whole
 *  campus would produce requests the events office has to decline. */
export async function getOrderSpaces() {
  return query<OrderSpace>(
    `SELECT id, name, building, capacity_seated, capacity_standing,
            supports_catering, facility_rate_external::text, rate_basis
       FROM spaces
      WHERE is_active AND externally_bookable
      ORDER BY building, sort_order, name`
  );
}
