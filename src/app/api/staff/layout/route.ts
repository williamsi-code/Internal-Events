import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getLayoutItems } from '@/lib/layouts';

/**
 * Saving and sharing layouts.
 *
 * A save replaces every item rather than diffing, because a layout is
 * one drawing rather than a set of independent records. Diffing would
 * be more code and would leave orphans when something is removed.
 */

const Create = z.object({
  action: z.literal('create'),
  spaceId: z.string().uuid(),
  requestId: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  isTemplate: z.boolean(),
});

const Save = z.object({
  action: z.literal('save'),
  layoutId: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable(),
  items: z
    .array(
      z.object({
        pieceCode: z.string().max(40),
        x: z.number().min(-50).max(500),
        y: z.number().min(-50).max(500),
        rotation: z.number().int().min(0).max(359),
        label: z.string().max(60).nullable(),
        seatsOverride: z.number().int().min(0).max(60).nullable(),
        sortOrder: z.number().int().min(0).max(999),
      })
    )
    .max(400),
});

const Share = z.object({
  action: z.literal('share'),
  layoutId: z.string().uuid(),
  shared: z.boolean(),
});

const Duplicate = z.object({
  action: z.literal('duplicate'),
  layoutId: z.string().uuid(),
  requestId: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
});

const LoadTemplate = z.object({
  action: z.literal('loadTemplate'),
  templateId: z.string().uuid(),
});

const Delete = z.object({
  action: z.literal('delete'),
  layoutId: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [
  Create,
  Save,
  Share,
  Duplicate,
  LoadTemplate,
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
      const space = await one<{ width_feet: string | null }>(
        'SELECT width_feet::text FROM spaces WHERE id = $1',
        [b.spaceId]
      );
      if (!space?.width_feet) {
        return NextResponse.json(
          {
            error:
              'That room has no dimensions yet, so a layout cannot be drawn to scale.',
          },
          { status: 409 }
        );
      }

      const row = await one<{ id: string }>(
        `INSERT INTO layouts
           (space_id, request_id, name, is_template, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [b.spaceId, b.requestId, b.name, b.isTemplate, user!.id]
      );
      return NextResponse.json({ ok: true, layoutId: row?.id });
    }

    if (b.action === 'save') {
      await transaction(async (c) => {
        await c.query(
          `UPDATE layouts SET name=$2, description=$3, updated_at=now()
            WHERE id=$1`,
          [b.layoutId, b.name, b.description]
        );

        await c.query('DELETE FROM layout_items WHERE layout_id = $1', [
          b.layoutId,
        ]);

        for (const i of b.items) {
          await c.query(
            `INSERT INTO layout_items
               (layout_id, piece_code, x_feet, y_feet, rotation,
                label, seats_override, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              b.layoutId, i.pieceCode, i.x, i.y, i.rotation,
              i.label, i.seatsOverride, i.sortOrder,
            ]
          );
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'share') {
      await query(
        `UPDATE layouts
            SET shared_at = CASE WHEN $2 THEN now() ELSE NULL END,
                shared_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
                updated_at = now()
          WHERE id = $1`,
        [b.layoutId, b.shared, user!.id]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'loadTemplate') {
      const items = await getLayoutItems(b.templateId);
      return NextResponse.json({ items });
    }

    if (b.action === 'duplicate') {
      const newId = await transaction(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO layouts
             (space_id, request_id, name, description, is_template, created_by)
           SELECT space_id, $2, $3, description, $2 IS NULL, $4
             FROM layouts WHERE id = $1
           RETURNING id`,
          [b.layoutId, b.requestId, b.name, user!.id]
        );
        const id = rows[0].id;

        await c.query(
          `INSERT INTO layout_items
             (layout_id, piece_code, x_feet, y_feet, rotation,
              label, seats_override, sort_order)
           SELECT $2, piece_code, x_feet, y_feet, rotation,
                  label, seats_override, sort_order
             FROM layout_items WHERE layout_id = $1`,
          [b.layoutId, id]
        );

        return id;
      });
      return NextResponse.json({ ok: true, layoutId: newId });
    }

    await query('DELETE FROM layouts WHERE id = $1', [b.layoutId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('layout action failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
