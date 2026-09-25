import { query, one } from './db';

/**
 * Inventory, the light version.
 *
 * Not a system that depletes stock after every event - that needs
 * someone recording every use, and the first week they forget, every
 * number afterwards is wrong and nobody trusts it again.
 *
 * Instead: somebody walks the shelves and types what is there. The
 * system says what is below par and what to order. That is the
 * version people actually keep up.
 *
 * The ledger underneath still supports per-event depletion if it is
 * ever wanted. It simply is not required for this to be useful.
 */

export interface StockItem {
  id: string;
  name: string;
  category: string | null;
  storage: string;
  base_unit: string;
  par_level: string;
  reorder_to: string | null;
  last_cost: string | null;
  allergens: string[];
  supplier_name: string | null;
  on_hand: string;
  stock_value: string;
  below_par: boolean;
  last_movement: string | null;
  last_counted: string | null;
  days_since_count: number | null;
  next_expiry: string | null;
}

export async function listStock() {
  return query<StockItem>(
    `SELECT st.id, st.name, st.category, st.storage, st.base_unit,
            st.par_level::text, st.reorder_to::text, st.last_cost::text,
            st.allergens, st.supplier_name,
            st.on_hand::text, st.stock_value::text, st.below_par,
            to_char(st.last_movement, 'Mon FMDD') AS last_movement,
            to_char(c.counted_at, 'Mon FMDD') AS last_counted,
            CASE WHEN c.counted_at IS NOT NULL
                 THEN (CURRENT_DATE - c.counted_at::date)
            END AS days_since_count,
            to_char(st.next_expiry, 'Mon FMDD') AS next_expiry
       FROM ingredient_stock st
       LEFT JOIN LATERAL (
         SELECT max(m.moved_at) AS counted_at
           FROM stock_movements m
          WHERE m.ingredient_id = st.id AND m.kind = 'counted'
       ) c ON true
      ORDER BY st.storage, st.category NULLS LAST, st.name`
  );
}

export interface ShoppingItem {
  id: string;
  name: string;
  category: string | null;
  storage: string;
  base_unit: string;
  on_hand: string;
  par_level: string;
  suggested_order: string;
  supplier_name: string | null;
  last_cost: string | null;
  estimated_cost: string;
}

export async function getShoppingList() {
  return query<ShoppingItem>(
    `SELECT id, name, category, storage, base_unit,
            on_hand::text, par_level::text,
            round(suggested_order, 2)::text AS suggested_order,
            supplier_name, last_cost::text,
            round(estimated_cost, 2)::text AS estimated_cost
       FROM shopping_list`
  );
}

/** What upcoming events will need, where a recipe exists to say so.
 *  Advisory: most menu items will have no recipe for a while. */
export async function getUpcomingNeeds(days = 14) {
  return query<{
    ingredient_id: string;
    ingredient_name: string;
    quantity: string;
    unit: string;
    on_hand: string;
    short_by: string;
    events: number;
  }>(
    `SELECT e.ingredient_id, e.ingredient_name,
            round(sum(e.quantity), 2)::text AS quantity,
            e.unit,
            max(e.on_hand)::text AS on_hand,
            round(greatest(sum(e.quantity) - max(e.on_hand), 0), 2)::text
              AS short_by,
            count(DISTINCT r.id)::int AS events
       FROM event_requests r
       CROSS JOIN LATERAL event_ingredients(r.id) e
      WHERE r.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int
        AND r.status IN ('confirmed', 'pending_final_review')
      GROUP BY e.ingredient_id, e.ingredient_name, e.unit
     HAVING sum(e.quantity) > max(e.on_hand)
      ORDER BY e.ingredient_name`,
    [days]
  );
}

export interface SupplierOption {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  item_count: number;
}

export async function listSuppliers() {
  return query<SupplierOption>(
    `SELECT s.id, s.name, s.contact_email::text, s.contact_phone,
            (SELECT count(*)::int FROM ingredients i
              WHERE i.supplier_id = s.id AND i.is_active) AS item_count
       FROM suppliers s
      WHERE s.is_active
      ORDER BY s.name`
  );
}

export async function listCategories() {
  return query<{ category: string }>(
    `SELECT DISTINCT category FROM ingredients
      WHERE is_active AND category IS NOT NULL
      ORDER BY category`
  );
}

export async function getStockSummary() {
  return one<{
    items: number;
    tracked: number;
    below_par: number;
    total_value: string;
    never_counted: number;
    stale_counts: number;
  }>(
    `SELECT
       count(*)::int AS items,
       count(*) FILTER (WHERE par_level > 0)::int AS tracked,
       count(*) FILTER (WHERE below_par)::int AS below_par,
       round(coalesce(sum(stock_value), 0), 2)::text AS total_value,
       count(*) FILTER (WHERE last_movement IS NULL)::int AS never_counted,
       (SELECT count(*)::int FROM ingredient_stock st
         WHERE st.par_level > 0
           AND NOT EXISTS (
             SELECT 1 FROM stock_movements m
              WHERE m.ingredient_id = st.id
                AND m.kind = 'counted'
                AND m.moved_at > now() - INTERVAL '30 days'
           )) AS stale_counts
       FROM ingredient_stock`
  );
}
