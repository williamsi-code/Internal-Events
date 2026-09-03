import { query, one } from './db';

/**
 * Room layouts.
 *
 * Everything is in feet. That is what the events office and the
 * rental companies already use, and converting only at the edges
 * keeps the scale honest.
 */

export interface LayoutPiece {
  code: string;
  label: string;
  category: string;
  shape: 'round' | 'rect';
  width_feet: string;
  length_feet: string;
  seats: number;
  colour: string;
  sort_order: number;
}

export async function listPieces() {
  return query<LayoutPiece>(
    `SELECT code, label, category, shape,
            width_feet::text, length_feet::text,
            seats, colour, sort_order
       FROM layout_pieces
      WHERE is_active
      ORDER BY sort_order`
  );
}

export interface LayoutSpace {
  id: string;
  name: string;
  building: string | null;
  width_feet: string | null;
  length_feet: string | null;
  ceiling_feet: string | null;
  capacity_seated: number | null;
  layout_notes: string | null;
}

export async function listLayoutableSpaces() {
  return query<LayoutSpace>(
    `SELECT id, name, building,
            width_feet::text, length_feet::text, ceiling_feet::text,
            capacity_seated, layout_notes
       FROM layoutable_spaces`
  );
}

export async function getLayoutSpace(id: string) {
  return one<LayoutSpace>(
    `SELECT id, name, building,
            width_feet::text, length_feet::text, ceiling_feet::text,
            capacity_seated, layout_notes
       FROM spaces WHERE id = $1`,
    [id]
  );
}

export interface LayoutItem {
  id: string;
  piece_code: string;
  x_feet: string;
  y_feet: string;
  rotation: number;
  label: string | null;
  seats_override: number | null;
  sort_order: number;
}

export interface Layout {
  id: string;
  space_id: string;
  request_id: string | null;
  name: string;
  description: string | null;
  is_template: boolean;
  shared_at: string | null;
  shared_by_name: string | null;
  created_by_name: string | null;
  updated_at: string;
  seats: number;
  item_count: number;
  space_name: string;
  building: string | null;
  width_feet: string | null;
  length_feet: string | null;
}

const LAYOUT_COLUMNS = `
  l.id, l.space_id, l.request_id, l.name, l.description, l.is_template,
  to_char(l.shared_at, 'Mon FMDD, YYYY') AS shared_at,
  sh.full_name AS shared_by_name,
  cr.full_name AS created_by_name,
  to_char(l.updated_at, 'Mon FMDD, YYYY') AS updated_at,
  layout_seats(l.id) AS seats,
  (SELECT count(*) FROM layout_items i WHERE i.layout_id = l.id) AS item_count,
  s.name AS space_name, s.building,
  s.width_feet::text, s.length_feet::text
`;

const LAYOUT_JOINS = `
  JOIN spaces s ON s.id = l.space_id
  LEFT JOIN users sh ON sh.id = l.shared_by
  LEFT JOIN users cr ON cr.id = l.created_by
`;

export async function getLayout(id: string) {
  return one<Layout>(
    `SELECT ${LAYOUT_COLUMNS} FROM layouts l ${LAYOUT_JOINS} WHERE l.id = $1`
  , [id]);
}

export async function getLayoutItems(layoutId: string) {
  return query<LayoutItem>(
    `SELECT id, piece_code, x_feet::text, y_feet::text,
            rotation, label, seats_override, sort_order
       FROM layout_items
      WHERE layout_id = $1
      ORDER BY sort_order, id`,
    [layoutId]
  );
}

/** Templates for a space, and layouts drawn for particular events. */
export async function listLayouts(spaceId?: string) {
  return query<Layout>(
    `SELECT ${LAYOUT_COLUMNS} FROM layouts l ${LAYOUT_JOINS}
      WHERE ($1::uuid IS NULL OR l.space_id = $1)
      ORDER BY l.is_template DESC, l.updated_at DESC
      LIMIT 200`,
    [spaceId ?? null]
  );
}

/** Layouts attached to one event. */
export async function getRequestLayouts(requestId: string) {
  return query<Layout>(
    `SELECT ${LAYOUT_COLUMNS} FROM layouts l ${LAYOUT_JOINS}
      WHERE l.request_id = $1
      ORDER BY l.updated_at DESC`,
    [requestId]
  );
}

/** What a requester is allowed to see: shared layouts only. */
export async function getSharedLayouts(requestId: string) {
  return query<Layout>(
    `SELECT ${LAYOUT_COLUMNS} FROM layouts l ${LAYOUT_JOINS}
      WHERE l.request_id = $1 AND l.shared_at IS NOT NULL
      ORDER BY l.updated_at DESC`,
    [requestId]
  );
}
