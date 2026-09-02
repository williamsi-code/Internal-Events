import { query, one } from './db';

/**
 * Space detail pages.
 *
 * The list view answers "how big is it". This answers "what is it
 * like", which is the question that actually decides a booking.
 */

export interface SpaceDetail {
  id: string;
  slug: string;
  name: string;
  building: string | null;
  category: string | null;
  tagline: string | null;
  long_description: string | null;
  features: string | null;
  setup_options: string | null;
  good_for: string | null;
  accessibility_notes: string | null;
  nearby_parking: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean;
  externally_bookable: boolean;
  is_active: boolean;
  facility_rate_external: string;
  rate_basis: string;
  hero_url: string | null;
  hero_alt: string | null;
  hero_media_id: string | null;
  floorplan_url: string | null;
  floorplan_alt: string | null;
  floorplan_media_id: string | null;
}

const DETAIL_COLUMNS = `
  s.id, s.slug, s.name, s.building, s.category,
  s.tagline, s.long_description, s.features, s.setup_options,
  s.good_for, s.accessibility_notes, s.nearby_parking,
  s.capacity_seated, s.capacity_standing, s.supports_catering,
  s.externally_bookable, s.is_active,
  s.facility_rate_external::text, s.rate_basis,
  hero.secure_url AS hero_url, hero.alt_text AS hero_alt, s.hero_media_id,
  plan.secure_url AS floorplan_url, plan.alt_text AS floorplan_alt,
  s.floorplan_media_id
`;

const DETAIL_JOINS = `
  LEFT JOIN media hero ON hero.id = s.hero_media_id
  LEFT JOIN media plan ON plan.id = s.floorplan_media_id
`;

export async function getSpaceBySlug(slug: string) {
  return one<SpaceDetail>(
    `SELECT ${DETAIL_COLUMNS} FROM spaces s ${DETAIL_JOINS}
      WHERE s.slug = $1`,
    [slug]
  );
}

export async function getSpaceById(id: string) {
  return one<SpaceDetail>(
    `SELECT ${DETAIL_COLUMNS} FROM spaces s ${DETAIL_JOINS}
      WHERE s.id = $1`,
    [id]
  );
}

export interface SpacePhoto {
  id: string;
  media_id: string;
  secure_url: string;
  alt_text: string | null;
  title: string;
  caption: string | null;
  sort_order: number;
}

export async function getSpacePhotos(spaceId: string) {
  return query<SpacePhoto>(
    `SELECT sm.id, sm.media_id, m.secure_url, m.alt_text, m.title,
            sm.caption, sm.sort_order
       FROM space_media sm
       JOIN media m ON m.id = sm.media_id
      WHERE sm.space_id = $1
      ORDER BY sm.sort_order, sm.created_at`,
    [spaceId]
  );
}

/** Other rooms someone might consider instead. Same building first,
 *  then similar capacity, because those are the two ways people
 *  actually substitute one room for another. */
export async function getRelatedSpaces(space: SpaceDetail) {
  return query<{
    id: string;
    slug: string;
    name: string;
    building: string | null;
    capacity_seated: number | null;
    hero_url: string | null;
  }>(
    `SELECT s.id, s.slug, s.name, s.building, s.capacity_seated,
            m.secure_url AS hero_url
       FROM spaces s
       LEFT JOIN media m ON m.id = s.hero_media_id
      WHERE s.is_active AND s.externally_bookable AND s.id <> $1
      ORDER BY (s.building IS DISTINCT FROM $2),
               abs(coalesce(s.capacity_seated, 0) - $3)
      LIMIT 3`,
    [space.id, space.building, space.capacity_seated ?? 0]
  );
}

export function splitLines(text: string | null) {
  if (!text) return [];
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** "Rounds of eight - 180" splits into a label and a number. */
export function parseSetup(line: string) {
  const m = line.match(/^(.*?)\s*[-\u2013]\s*(\d+)\s*$/);
  if (m) return { label: m[1].trim(), count: m[2] };
  return { label: line, count: null };
}
