import { query, one } from './db';

/**
 * The media library.
 *
 * Cloudinary holds the files; this holds what they are and where
 * they are used. Uploads go from the browser straight to Cloudinary
 * with a server-signed request, so the API secret never reaches the
 * browser and the file never passes through our server.
 */

export interface MediaItem {
  id: string;
  public_id: string;
  secure_url: string;
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  title: string;
  alt_text: string | null;
  tags: string[] | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
  block_count: number;
  is_hero: boolean;
  used_in: string[];
}

export async function listMedia() {
  return query<MediaItem>(
    `SELECT m.id, m.public_id, m.secure_url, m.format,
            m.width, m.height, m.bytes, m.title, m.alt_text, m.tags,
            u.full_name AS uploaded_by_name,
            to_char(m.uploaded_at, 'Mon FMDD, YYYY') AS uploaded_at,
            coalesce(usage.block_count, 0) AS block_count,
            coalesce(usage.is_hero, false) AS is_hero,
            coalesce(usage.used_in, '{}') AS used_in
       FROM media m
       LEFT JOIN users u ON u.id = m.uploaded_by
       LEFT JOIN media_usage usage ON usage.id = m.id
      WHERE NOT m.is_archived
      ORDER BY m.uploaded_at DESC`
  );
}

export interface CloudinaryStatus {
  configured: boolean;
  cloudName: string | null;
}

/** Whether uploading is actually possible, so the interface can say
 *  so rather than offering a control that fails. */
export function getCloudinaryStatus(): CloudinaryStatus {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? null;
  const configured = !!(
    cloudName &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  return { configured, cloudName };
}
