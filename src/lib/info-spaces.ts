import { query } from './db';

/**
 * Public event spaces.
 *
 * Grouped by category then building, because that is how someone
 * looking for a room actually thinks: a meeting venue, somewhere
 * outdoors, a classroom. Building alone is a flat list of 21 names
 * that means nothing to a visitor.
 */

export interface PublicSpace {
  id: string;
  campus: string;
  category: string | null;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean;
  description: string | null;
  facility_rate_external: string;
  rate_basis: string;
}

export async function listPublicSpaces() {
  return query<PublicSpace>(
    `SELECT id, campus, category, name, building,
            capacity_seated, capacity_standing,
            supports_catering, description,
            facility_rate_external::text, rate_basis
       FROM spaces
      WHERE is_active
      ORDER BY
        CASE category
          WHEN 'Meeting Venues' THEN 0
          WHEN 'Outside Spaces' THEN 1
          WHEN 'Academic'       THEN 2
          WHEN 'Athletics'      THEN 3
          WHEN 'Housing'        THEN 4
          ELSE 5
        END,
        building, sort_order, name`
  );
}
