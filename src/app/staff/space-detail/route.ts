import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Space detail content.
 *
 * Separate from the main admin route because this is descriptive
 * content rather than the operational fields the workflow depends on.
 * Someone writing room copy should not be able to accidentally change
 * a capacity or a rate.
 */

const Details = z.object({
  action: z.literal('details'),
  spaceId: z.string().uuid(),
  tagline: z.string().max(200).nullable(),
  longDescription: z.string().max(4000).nullable(),
  features: z.string().max(2000).nullable(),
  setupOptions: z.string().max(2000).nullable(),
  goodFor: z.string().max(1000).nullable(),
  accessibilityNotes: z.string().max(1000).nullable(),
  nearbyParking: z.string().max(1000).nullable(),
  heroMediaId: z.string().uuid().nullable(),
  floorplanMediaId: z.string().uuid().nullable(),
});

const AddPhoto = z.object({
  action: z.literal('addPhoto'),
  spaceId: z.string().uuid(),
  mediaId: z.string().uuid(),
  caption: z.string().max(200).nullable(),
});

const UpdatePhoto = z.object({
  action: z.literal('updatePhoto'),
  id: z.string().uuid(),
  caption: z.string().max(200).nullable(),
  sortOrder: z.number().int().min(0).max(99),
});

const RemovePhoto = z.object({
  action: z.literal('removePhoto'),
  id: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [
  Details,
  AddPhoto,
  UpdatePhoto,
  RemovePhoto,
]);

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
    if (b.action === 'details') {
      await query(
        `UPDATE spaces
            SET tagline=$2, long_description=$3, features=$4,
                setup_options=$5, good_for=$6, accessibility_notes=$7,
                nearby_parking=$8, hero_media_id=$9, floorplan_media_id=$10
          WHERE id=$1`,
        [
          b.spaceId, b.tagline, b.longDescription, b.features,
          b.setupOptions, b.goodFor, b.accessibilityNotes,
          b.nearbyParking, b.heroMediaId, b.floorplanMediaId,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'addPhoto') {
      const next = await one<{ n: string }>(
        `SELECT coalesce(max(sort_order), -1) + 1 AS n
           FROM space_media WHERE space_id = $1`,
        [b.spaceId]
      );
      await query(
        `INSERT INTO space_media (space_id, media_id, caption, sort_order)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (space_id, media_id) DO NOTHING`,
        [b.spaceId, b.mediaId, b.caption, Number(next?.n ?? 0)]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'updatePhoto') {
      await query(
        'UPDATE space_media SET caption=$2, sort_order=$3 WHERE id=$1',
        [b.id, b.caption, b.sortOrder]
      );
      return NextResponse.json({ ok: true });
    }

    await query('DELETE FROM space_media WHERE id=$1', [b.id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('space detail save failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
