import { query, one } from './db';

/**
 * Back office reads.
 *
 * Everything editable here is reference data the request workflow
 * depends on, so the guiding rule is that nothing is ever destroyed:
 * spaces and menu items are deactivated rather than deleted, and a
 * price change closes the old row and opens a new one. A confirmed
 * event must still be able to show the price it was quoted.
 */

export interface AdminSpace {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  events_booked: number;
}

export async function listAdminSpaces() {
  return query<AdminSpace>(
    `SELECT s.id, s.name, s.building, s.capacity_seated, s.capacity_standing,
            s.supports_catering, s.description, s.is_active, s.sort_order,
            (SELECT count(*) FROM event_requests r
              WHERE r.space_id = s.id
                AND r.status NOT IN ('cancelled','denied')) AS events_booked
       FROM spaces s
      ORDER BY s.is_active DESC, s.sort_order, s.name`
  );
}

export interface AdminMenuItem {
  id: string;
  category_id: string;
  category: string;
  name: string;
  description: string | null;
  unit: string;
  minimum_quantity: number | null;
  allergen_notes: string | null;
  is_active: boolean;
  sort_order: number;
  internal_price: string | null;
  internal_revenue_price: string | null;
  affiliated_price: string | null;
  external_price: string | null;
  times_ordered: number;
}

export async function listAdminMenu() {
  return query<AdminMenuItem>(
    `SELECT mi.id, mi.category_id, c.name AS category, mi.name, mi.description,
            mi.unit, mi.minimum_quantity, mi.allergen_notes,
            mi.is_active, mi.sort_order,
            max(mip.unit_price) FILTER (WHERE mip.path='internal_non_revenue')::text
              AS internal_price,
            max(mip.unit_price) FILTER (WHERE mip.path='internal_revenue_generating')::text
              AS internal_revenue_price,
            max(mip.unit_price) FILTER (WHERE mip.path='affiliated_cost_recovery')::text
              AS affiliated_price,
            max(mip.unit_price) FILTER (WHERE mip.path='external_commercial')::text
              AS external_price,
            (SELECT count(*) FROM request_menu_selections sel
              WHERE sel.menu_item_id = mi.id) AS times_ordered
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
       LEFT JOIN menu_item_prices mip
              ON mip.menu_item_id = mi.id
             AND mip.effective_from <= CURRENT_DATE
             AND (mip.effective_to IS NULL OR mip.effective_to > CURRENT_DATE)
      GROUP BY mi.id, c.name, c.sort_order
      ORDER BY mi.is_active DESC, c.sort_order, mi.sort_order`
  );
}

export interface AdminCategory {
  id: string;
  name: string;
  sort_order: number;
}

export async function listCategories() {
  return query<AdminCategory>(
    `SELECT id, name, sort_order FROM menu_categories
      WHERE is_active ORDER BY sort_order`
  );
}

export interface AdminPage {
  slug: string;
  title: string;
  intro: string | null;
  body: string;
  is_published: boolean;
  updated_at: string;
  updated_by_name: string | null;
}

export async function listAdminPages() {
  return query<AdminPage>(
    `SELECT p.slug, p.title, p.intro, p.body, p.is_published,
            to_char(p.updated_at, 'Mon FMDD, YYYY') AS updated_at,
            u.full_name AS updated_by_name
       FROM content_pages p
       LEFT JOIN users u ON u.id = p.updated_by
      ORDER BY p.slug`
  );
}

export async function getAdminPage(slug: string) {
  return one<AdminPage>(
    `SELECT p.slug, p.title, p.intro, p.body, p.is_published,
            to_char(p.updated_at, 'Mon FMDD, YYYY') AS updated_at,
            u.full_name AS updated_by_name
       FROM content_pages p
       LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.slug = $1`,
    [slug]
  );
}
