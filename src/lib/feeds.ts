import { query } from './db';

/**
 * Calendar feeds.
 *
 * Each is a read-only .ics URL someone can subscribe to in Outlook.
 * The token is the whole of the security, so the interface has to be
 * clear about what a link gives away.
 */

export interface CalendarFeed {
  id: string;
  token: string;
  label: string;
  scope: string;
  building: string | null;
  space_id: string | null;
  space_name: string | null;
  category: string | null;
  show_details: boolean;
  include_tentative: boolean;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
  last_fetched_at: string | null;
  fetch_count: number;
  event_count: number;
}

export async function listFeeds() {
  return query<CalendarFeed>(
    `SELECT f.id, f.token, f.label, f.scope::text,
            f.building, f.space_id, s.name AS space_name, f.category,
            f.show_details, f.include_tentative, f.is_active,
            u.full_name AS created_by_name,
            to_char(f.created_at, 'Mon FMDD, YYYY') AS created_at,
            to_char(f.last_fetched_at, 'Mon FMDD at FMHH12:MI AM')
              AS last_fetched_at,
            f.fetch_count,
            (SELECT count(*) FROM feed_bookings(f.token)) AS event_count
       FROM calendar_feeds f
       LEFT JOIN spaces s ON s.id = f.space_id
       LEFT JOIN users u ON u.id = f.created_by
      ORDER BY f.is_active DESC, f.created_at DESC`
  );
}

export async function listFeedTargets() {
  const [buildings, spaces, categories] = await Promise.all([
    query<{ building: string }>(
      `SELECT DISTINCT building FROM spaces
        WHERE is_active AND building IS NOT NULL
        ORDER BY building`
    ),
    query<{ id: string; name: string; building: string | null }>(
      `SELECT id, name, building FROM spaces
        WHERE is_active ORDER BY building, sort_order, name`
    ),
    query<{ category: string }>(
      `SELECT DISTINCT category FROM spaces
        WHERE is_active AND category IS NOT NULL
        ORDER BY category`
    ),
  ]);
  return { buildings, spaces, categories };
}
