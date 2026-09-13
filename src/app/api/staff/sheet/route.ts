import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Manual lines and kitchen notes.
 *
 * Staff only. These change what the customer is charged, so they are
 * not something a requester can add to their own event.
 */

const AddLine = z.object({
  action: z.literal('addLine'),
  requestId: z.string().uuid(),
  kind: z.enum(['food', 'labor', 'rental', 'delivery', 'discount', 'other']),
  description: z.string().min(1).max(300),
  quantity: z.number().min(-10_000).max(10_000),
  unitPrice: z.number().min(-1_000_000).max(1_000_000),
  unitLabel: z.string().max(40).nullable(),
  isCharged: z.boolean(),
});

const UpdateLine = z.object({
  action: z.literal('updateLine'),
  id: z.string().uuid(),
  description: z.string().min(1).max(300),
  quantity: z.number().min(-10_000).max(10_000),
  unitPrice: z.number().min(-1_000_000).max(1_000_000),
  unitLabel: z.string().max(40).nullable(),
  isCharged: z.boolean(),
});

const RemoveLine = z.object({
  action: z.literal('removeLine'),
  id: z.string().uuid(),
});

const SaveNotes = z.object({
  action: z.literal('notes'),
  requestId: z.string().uuid(),
  notes: z.string().max(8000).nullable(),
});

const Body = z.discriminatedUnion('action', [
  AddLine,
  UpdateLine,
  RemoveLine,
  SaveNotes,
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
    if (b.action === 'addLine') {
      const next = await one<{ n: string }>(
        `SELECT coalesce(max(sort_order), -1) + 1 AS n
           FROM sheet_lines WHERE request_id = $1`,
        [b.requestId]
      );

      // A discount is stored as a negative price rather than a flag,
      // so the arithmetic downstream stays ordinary.
      const price =
        b.kind === 'discount' && b.unitPrice > 0 ? -b.unitPrice : b.unitPrice;

      await query(
        `INSERT INTO sheet_lines
           (request_id, kind, description, quantity, unit_price,
            unit_label, is_charged, sort_order, created_by)
         VALUES ($1,$2::manual_line_kind,$3,$4,$5,$6,$7,$8,$9)`,
        [
          b.requestId, b.kind, b.description, b.quantity, price,
          b.unitLabel, b.isCharged, Number(next?.n ?? 0), user!.id,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'updateLine') {
      await query(
        `UPDATE sheet_lines
            SET description = $2, quantity = $3, unit_price = $4,
                unit_label = $5, is_charged = $6
          WHERE id = $1`,
        [b.id, b.description, b.quantity, b.unitPrice, b.unitLabel, b.isCharged]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'removeLine') {
      await query('DELETE FROM sheet_lines WHERE id = $1', [b.id]);
      return NextResponse.json({ ok: true });
    }

    await query('UPDATE event_requests SET sheet_notes = $2 WHERE id = $1', [
      b.requestId,
      b.notes,
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('sheet line failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
