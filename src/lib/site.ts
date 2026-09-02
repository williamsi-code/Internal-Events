import { query, one } from './db';

/**
 * Public site content.
 *
 * Everything on the front page is editable from the back office,
 * because a page that needs a developer to update is a page that
 * stops being updated.
 *
 * Images resolve through the media library where one is attached, so
 * replacing a photograph updates everywhere it appears rather than
 * only where someone remembered to change the URL.
 */

export interface SiteSettings {
  hero_eyebrow: string;
  hero_title: string;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  hero_media_id: string | null;
  intro_heading: string | null;
  intro_body: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  office_hours: string | null;
  address: string | null;
  services_heading: string;
  services_list: string | null;
  amenities_heading: string;
  amenities_list: string | null;
  secondary_cta_label: string | null;
  secondary_cta_url: string | null;
}

export async function getSiteSettings() {
  return one<SiteSettings>(
    `SELECT s.hero_eyebrow, s.hero_title, s.hero_subtitle,
            coalesce(m.secure_url, s.hero_image_url) AS hero_image_url,
            s.hero_media_id,
            s.intro_heading, s.intro_body,
            s.contact_phone, s.contact_email, s.office_hours, s.address,
            s.services_heading, s.services_list,
            s.amenities_heading, s.amenities_list,
            s.secondary_cta_label, s.secondary_cta_url
       FROM site_settings s
       LEFT JOIN media m ON m.id = s.hero_media_id
      WHERE s.id`
  );
}

export type BlockKind =
  | 'news'
  | 'menu_spotlight'
  | 'staff_spotlight'
  | 'gallery'
  | 'occasion'
  | 'testimonial';

export interface SiteBlock {
  id: string;
  kind: BlockKind;
  title: string;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  image_alt: string | null;
  media_id: string | null;
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

const BLOCK_COLUMNS = `
  b.id, b.kind, b.title, b.subtitle, b.body,
  coalesce(m.secure_url, b.image_url) AS image_url,
  coalesce(m.alt_text, b.image_alt) AS image_alt,
  b.media_id, b.link_url, b.link_label, b.menu_item_id,
  b.sort_order, b.is_published,
  to_char(b.publish_from, 'YYYY-MM-DD') AS publish_from,
  to_char(b.publish_to, 'YYYY-MM-DD') AS publish_to
`;

/** Published blocks inside their publish window. A spotlight's price
 *  is read live from the menu rather than copied, so it cannot drift
 *  out of date on the front page. */
export async function getSiteBlocks(kind?: string) {
  return query<SiteBlock>(
    `SELECT ${BLOCK_COLUMNS},
            p.unit_price::text AS menu_price,
            mi.unit AS menu_unit
       FROM site_blocks b
       LEFT JOIN media m ON m.id = b.media_id
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
        AND ($1::text IS NULL OR b.kind = $1)
      ORDER BY b.sort_order, b.created_at DESC`,
    [kind ?? null]
  );
}

/** Everything, published or not, for the back office. */
export async function getAllSiteBlocks() {
  return query<SiteBlock>(
    `SELECT ${BLOCK_COLUMNS},
            null::text AS menu_price, null::text AS menu_unit
       FROM site_blocks b
       LEFT JOIN media m ON m.id = b.media_id
      ORDER BY b.kind, b.sort_order, b.created_at DESC`
  );
}

export interface MenuItemOption {
  id: string;
  name: string;
  category: string;
}

export async function listMenuItemOptions() {
  return query<MenuItemOption>(
    `SELECT mi.id, mi.name, c.name AS category
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
      WHERE mi.is_active AND c.is_active
      ORDER BY c.sort_order, mi.sort_order`
  );
}

/** A newline-separated list stored as one field, because these are
 *  short lists that change together and a table would be overkill. */
export function splitList(text: string | null) {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
