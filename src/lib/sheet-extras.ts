import { query, one } from './db';
import type { SheetLine } from './sheet-line-kinds';

/**
 * Manual lines and notes on the catering sheet.
 *
 * A manual line is money, so it counts toward the quoted total and
 * reaches the reports. Notes are for the kitchen and carry no charge.
 *
 * The kind labels and the SheetLine type live in sheet-line-kinds.ts
 * so client components can use them without importing this file.
 */

export async function getSheetLines(requestId: string) {
  return query<SheetLine>(
    `SELECT l.id, l.kind::text, l.description,
            l.quantity::text, l.unit_price::text, l.unit_label,
            l.is_charged,
            (l.quantity * l.unit_price)::text AS line_total,
            l.sort_order,
            u.full_name AS created_by_name
       FROM sheet_lines l
       LEFT JOIN users u ON u.id = l.created_by
      WHERE l.request_id = $1
      ORDER BY l.sort_order, l.created_at`,
    [requestId]
  );
}

export async function getSheetNotes(requestId: string) {
  const row = await one<{ sheet_notes: string | null }>(
    'SELECT sheet_notes FROM event_requests WHERE id = $1',
    [requestId]
  );
  return row?.sheet_notes ?? null;
}
