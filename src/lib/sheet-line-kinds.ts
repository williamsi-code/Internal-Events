/**
 * Kinds of manual line, and the shape of one.
 *
 * Kept apart from sheet-extras.ts because that module imports the
 * database client, and a client component importing anything from it
 * drags the Postgres driver into the browser bundle.
 */

export const LINE_KINDS = [
  ['food', 'Food'],
  ['labor', 'Labour'],
  ['rental', 'Rental'],
  ['delivery', 'Delivery'],
  ['discount', 'Discount'],
  ['other', 'Other'],
] as const;

export type LineKind = (typeof LINE_KINDS)[number][0];

export interface SheetLine {
  id: string;
  kind: string;
  description: string;
  quantity: string;
  unit_price: string;
  unit_label: string | null;
  is_charged: boolean;
  line_total: string;
  sort_order: number;
  created_by_name: string | null;
}
