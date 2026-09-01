import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Recording and managing uploaded images.
 *
 * The upload itself happens browser-to-Cloudinary; this records what
 * came back so the library can show it without calling Cloudinary.
 */

const Record_ = z.object({
  action: z.literal('record'),
  publicId: z.string().min(1).max(300),
  secureUrl: z.string().url().max(600),
  format: z.string().max(20).nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  bytes: z.number().int().nullable(),
  title: z.string().min(1).max(200),
  altText: z.string().max(300).nullable(),
  tags: z.array(z.string().max(40)).max(10).nullable(),
});

const Update = z.object({
  action: z.literal('update'),
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  altText: z.string().max(300).nullable(),
  tags: z.array(z.string().max(40)).max(10).nullable(),
});

const Archive = z.object({
  action: z.literal('archive'),
  id: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [Record_, Update, Archive]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const b = parsed.data;

  try {
    if (b.action === 'record') {
      const row = await one<{ id: string }>(
        `INSERT INTO media
           (public_id, secure_url, format, width, height, bytes,
            title, alt_text, tags, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (public_id) DO UPDATE
           SET secure_url = EXCLUDED.secure_url,
               title = EXCLUDED.title,
               alt_text = EXCLUDED.alt_text
         RETURNING id`,
        [
          b.publicId, b.secureUrl, b.format, b.width, b.height, b.bytes,
          b.title, b.altText, b.tags, user!.id,
        ]
      );
      return NextResponse.json({ ok: true, id: row?.id });
    }

    if (b.action === 'update') {
      await query(
        `UPDATE media SET title = $2, alt_text = $3, tags = $4
          WHERE id = $1`,
        [b.id, b.title, b.altText, b.tags]
      );
      return NextResponse.json({ ok: true });
    }

    // Archiving hides an image without breaking anything currently
    // using it. Removal from Cloudinary is deliberately manual.
    const inUse = await one<{ n: string }>(
      `SELECT (coalesce(block_count,0) + CASE WHEN is_hero THEN 1 ELSE 0 END)::text AS n
         FROM media_usage WHERE id = $1`,
      [b.id]
    );
    if (Number(inUse?.n ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            'That image is still in use on the front page. Remove it there first.',
        },
        { status: 409 }
      );
    }

    await query('UPDATE media SET is_archived = true WHERE id = $1', [b.id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('media action failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
