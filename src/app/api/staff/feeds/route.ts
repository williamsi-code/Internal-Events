import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Create = z.object({
  action: z.literal('create'),
  label: z.string().min(1).max(160),
  scope: z.enum(['all', 'building', 'space', 'category']),
  building: z.string().max(120).nullable(),
  spaceId: z.string().uuid().nullable(),
  category: z.string().max(60).nullable(),
  showDetails: z.boolean(),
  includeTentative: z.boolean(),
});

const Update = z.object({
  action: z.literal('update'),
  feedId: z.string().uuid(),
  label: z.string().min(1).max(160),
  showDetails: z.boolean(),
  includeTentative: z.boolean(),
  isActive: z.boolean(),
});

/** A new token invalidates every existing subscription, which is the
 *  point: it is how a shared link is taken back. */
const Regenerate = z.object({
  action: z.literal('regenerate'),
  feedId: z.string().uuid(),
});

const Delete = z.object({
  action: z.literal('delete'),
  feedId: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [
  Create,
  Update,
  Regenerate,
  Delete,
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
    if (b.action === 'create') {
      const row = await one<{ token: string }>(
        `INSERT INTO calendar_feeds
           (label, scope, building, space_id, category,
            show_details, include_tentative, created_by)
         VALUES ($1,$2::feed_scope,$3,$4,$5,$6,$7,$8)
         RETURNING token`,
        [
          b.label, b.scope,
          b.scope === 'building' ? b.building : null,
          b.scope === 'space' ? b.spaceId : null,
          b.scope === 'category' ? b.category : null,
          b.showDetails, b.includeTentative, user!.id,
        ]
      );
      return NextResponse.json({ ok: true, token: row?.token });
    }

    if (b.action === 'update') {
      await query(
        `UPDATE calendar_feeds
            SET label=$2, show_details=$3, include_tentative=$4, is_active=$5
          WHERE id=$1`,
        [b.feedId, b.label, b.showDetails, b.includeTentative, b.isActive]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'regenerate') {
      const row = await one<{ token: string }>(
        `UPDATE calendar_feeds
            SET token = encode(gen_random_bytes(24), 'hex')
          WHERE id = $1
          RETURNING token`,
        [b.feedId]
      );
      return NextResponse.json({ ok: true, token: row?.token });
    }

    await query('DELETE FROM calendar_feeds WHERE id = $1', [b.feedId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('feed action failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
