import { query, one } from './db';

/**
 * Public site content.
 *
 * Everything on the front page is editable from the back office,
 * because a page that needs a developer to update is a page that
 * stops being updated.
 */

export interface SiteSettings {
  hero_eyebrow: string;
  hero_title: string;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  intro_heading: string | null;
  intro_body: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  office_hours: string | null;
}

export async function getSiteSettings() {
  return one<SiteSettings>(
    `SELECT hero_eyebrow, hero_title, hero_subtitle, hero_image_url,
            intro_heading, intro_body, contact_phone, contact_email,
            office_hours
       FROM site_settings WHERE id`
  );
}

export interface SiteBlock {
  id: string;
  kind: 'news' | 'menu_spotlight' | 'staff_spotlight' | 'gallery';
  title: string;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  image_alt: string | null;
  link_url: string | null;
  link_label: string | null;
  menu_item_id: string | null;
  menu_price: string | null;
  menu_unit: string | null;
  sort_order: number;
  is_published: boolean;
  publish_from: string | null;
  publish_to: string | null;
}

/** Published blocks inside their publish window, if they have one.
 *  A spotlight's price is read live from the menu rather than copied,
 *  so it cannot drift out of date on the front page. */
export async function getSiteBlocks(kind?: string) {
  return query<SiteBlock>(
    `SELECT b.id, b.kind, b.title, b.subtitle, b.body,
            b.image_url, b.image_alt, b.link_url, b.link_label,
            b.menu_item_id,
            p.unit_price::text AS menu_price,
            mi.unit AS menu_unit,
            b.sort_order, b.is_published,
            to_char(b.publish_from, 'YYYY-MM-DD') AS publish_from,
            to_char(b.publish_to, 'YYYY-MM-DD') AS publish_to
       FROM site_blocks b
       LEFT JOIN menu_items mi ON mi.id = b.menu_item_id
       LEFT JOIN LATERAL (
         SELECT unit_price FROM menu_item_prices
          WHERE menu_item_id = b.menu_item_id
            AND path = 'external_commercial'
            AND effective_from <= CURRENT_DATE
            AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
          ORDER BY effective_from DESC LIMIT 1
       ) p ON true
      WHERE b.is_published
        AND (b.publish_from IS NULL OR b.publish_from <= CURRENT_DATE)
        AND (b.publish_to IS NULL OR b.publish_to >= CURRENT_DATE)
        AND ($1::text IS NULL OR b.kind = $1::content_block_kind)
      ORDER BY b.sort_order, b.created_at DESC`,
    [kind ?? null]
  );
}

/** Everything, published or not, for the back office. */
export async function getAllSiteBlocks() {
  return query<SiteBlock>(
    `SELECT b.id, b.kind, b.title, b.subtitle, b.body,
            b.image_url, b.image_alt, b.link_url, b.link_label,
            b.menu_item_id, null::text AS menu_price, null::text AS menu_unit,
            b.sort_order, b.is_published,
            to_char(b.publish_from, 'YYYY-MM-DD') AS publish_from,
            to_char(b.publish_to, 'YYYY-MM-DD') AS publish_to
       FROM site_blocks b
      ORDER BY b.kind, b.sort_order, b.created_at DESC`
  );
}

export interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  event_type: string | null;
  approx_date: string | null;
  approx_guests: number | null;
  message: string;
  handled_at: string | null;
  handled_by_name: string | null;
  created_at: string;
}

export async function listEnquiries() {
  return query<Enquiry>(
    `SELECT e.id, e.name, e.email, e.phone, e.organization,
            e.event_type,
            to_char(e.approx_date, 'Mon FMDD, YYYY') AS approx_date,
            e.approx_guests, e.message,
            to_char(e.handled_at, 'Mon FMDD, YYYY') AS handled_at,
            u.full_name AS handled_by_name,
            to_char(e.created_at, 'Mon FMDD, YYYY') AS created_at
       FROM enquiries e
       LEFT JOIN users u ON u.id = e.handled_by
      ORDER BY e.handled_at NULLS FIRST, e.created_at DESC
      LIMIT 200`
  );
}
