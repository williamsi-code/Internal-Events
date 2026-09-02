import { query } from './db';

/**
 * Event spaces.
 *
 * Two audiences see two different lists. An outside customer sees
 * the three buildings we actually host external events in; a Central
 * department sees everything. Showing an outside customer a
 * residence hall lounge only produces a request someone has to
 * decline.
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
  externally_bookable: boolean;
  description: string | null;
  facility_rate_external: string;
  rate_basis: string;
}

const COLUMNS = `
  id, campus, category, name, building,
  capacity_seated, capacity_standing,
  supports_catering, externally_bookable, description,
  facility_rate_external::text, rate_basis
`;

const ORDER = `
  ORDER BY
    CASE category
      WHEN 'Meeting Venues' THEN 0
      WHEN 'Outside Spaces' THEN 1
      WHEN 'Academic'       THEN 2
      WHEN 'Athletics'      THEN 3
      WHEN 'Housing'        THEN 4
      ELSE 5
    END,
    building, sort_order, name
`;

/** What an outside customer can see and book. */
export async function listPublicSpaces() {
  return query<PublicSpace>(
    `SELECT ${COLUMNS} FROM spaces
      WHERE is_active AND externally_bookable ${ORDER}`
  );
}

/** Everything a Central department can book. */
export async function listAllSpaces() {
  return query<PublicSpace>(
    `SELECT ${COLUMNS} FROM spaces WHERE is_active ${ORDER}`
  );
}
