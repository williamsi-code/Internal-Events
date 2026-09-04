import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getLayoutItems } from '@/lib/layouts';

/**
 * Saving and sharing layouts.
 *
 * Sharing does two things: it makes the layout visible on the
 * requester's page, and it posts a message into their thread. Without
 * the message the layout appears silently and nobody looks at it,
 * which defeats the point of drawing it.
 */

const Create = z.object({
  action: z.literal('create'),
  spaceId: z.string().uuid(),
  requestId: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  isTemplate: z.boolean(),
});

/** Draw a layout for an event, using whichever room it is booked in. */
const CreateForRequest = z.object({
  action: z.literal('createForRequest'),
  requestId: z.string().uuid(),
  name: z.string().min(1).max(160),
  fromTemplateId: z.string().uuid().nullable(),
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
  message: z.string().max(2000).nullable().optional(),
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
  CreateForRequest,
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
    /* ---------- create for an event ---------- */
    if (b.action === 'createForRequest') {
      const request = await one<{
        space_id: string | null;
        width_feet: string | null;
        space_name: string | null;
      }>(
        `SELECT r.space_id, s.width_feet::text, s.name AS space_name
           FROM event_requests r
           LEFT JOIN spaces s ON s.id = r.space_id
          WHERE r.id = $1`,
        [b.requestId]
      );

      if (!request?.space_id) {
        return NextResponse.json(
          { error: 'This event has no room booked, so there is nothing to lay out.' },
          { status: 409 }
        );
      }
      if (!request.width_feet) {
        return NextResponse.json(
          {
            error: `${request.space_name} has no dimensions recorded, so a layout cannot be drawn to scale. Add them in Event spaces first.`,
          },
          { status: 409 }
        );
      }

      const newId = await transaction(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO layouts
             (space_id, request_id, name, is_template, created_by)
           VALUES ($1, $2, $3, false, $4)
           RETURNING id`,
          [request.space_id, b.requestId, b.name, user!.id]
        );
        const id = rows[0].id;

        // Starting from a template copies its contents, which is the
        // usual case: most events are a variation on a standard setup.
        if (b.fromTemplateId) {
          await c.query(
            `INSERT INTO layout_items
               (layout_id, piece_code, x_feet, y_feet, rotation,
                label, seats_override, sort_order)
             SELECT $2, piece_code, x_feet, y_feet, rotation,
                    label, seats_override, sort_order
               FROM layout_items WHERE layout_id = $1`,
            [b.fromTemplateId, id]
          );
        }

        return id;
      });

      return NextResponse.json({ ok: true, layoutId: newId });
    }

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

    /* ---------- share ---------- */
    if (b.action === 'share') {
      const layout = await one<{
        request_id: string | null;
        name: string;
        seats: number;
      }>(
        `SELECT request_id, name, layout_seats(id) AS seats
           FROM layouts WHERE id = $1`,
        [b.layoutId]
      );

      await transaction(async (c) => {
        await c.query(
          `UPDATE layouts
              SET shared_at = CASE WHEN $2 THEN now() ELSE NULL END,
                  shared_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
                  updated_at = now()
            WHERE id = $1`,
          [b.layoutId, b.shared, user!.id]
        );

        // Telling them is the point. A layout that appears silently on
        // a page nobody revisits has not been sent.
        if (b.shared && layout?.request_id) {
          await c.query(
            `INSERT INTO request_messages
               (request_id, author_id, body, is_internal, requires_reply)
             VALUES ($1, $2, $3, false, true)`,
            [
              layout.request_id,
              user!.id,
              b.message?.trim() ||
                `We have drawn a room layout for your event: "${layout.name}", seating ${layout.seats}. It is on your event page. Have a look and tell us if anything needs moving.`,
            ]
          );
        }
      });

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
