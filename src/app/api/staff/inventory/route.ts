import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Inventory.
 *
 * A count says what is on the shelf; the difference from what we
 * thought becomes an adjustment row, so the ledger stays a record of
 * what happened rather than being quietly overwritten.
 */

const Count = z.object({
  action: z.literal('count'),
  counts: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        onHand: z.number().min(0).max(1_000_000),
      })
    )
    .min(1)
    .max(500),
  note: z.string().max(500).nullable(),
});

const Receive = z.object({
  action: z.literal('receive'),
  ingredientId: z.string().uuid(),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().max(20),
  unitCost: z.number().min(0).max(100_000).nullable(),
  supplierId: z.string().uuid().nullable(),
  invoiceRef: z.string().max(100).nullable(),
  expiresOn: z.string().date().nullable(),
});

const Waste = z.object({
  action: z.literal('waste'),
  ingredientId: z.string().uuid(),
  quantity: z.number().positive().max(1_000_000),
  note: z.string().max(300),
});

const SaveIngredient = z.object({
  action: z.literal('ingredient'),
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  category: z.string().max(80).nullable(),
  storage: z.enum(['dry', 'refrigerated', 'frozen', 'chemical', 'equipment']),
  baseUnit: z.string().max(20),
  purchaseUnit: z.string().max(20).nullable(),
  purchaseSize: z.number().positive().max(100_000).nullable(),
  parLevel: z.number().min(0).max(1_000_000),
  reorderTo: z.number().min(0).max(1_000_000).nullable(),
  lastCost: z.number().min(0).max(100_000).nullable(),
  supplierId: z.string().uuid().nullable(),
  allergens: z.array(z.string().max(40)).max(12),
  isActive: z.boolean(),
  notes: z.string().max(1000).nullable(),
});

const SaveSupplier = z.object({
  action: z.literal('supplier'),
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  contactName: z.string().max(120).nullable(),
  contactEmail: z.string().max(200).nullable(),
  contactPhone: z.string().max(50).nullable(),
  leadTimeDays: z.number().int().min(0).max(90),
  notes: z.string().max(1000).nullable(),
});

const Body = z.discriminatedUnion('action', [
  Count,
  Receive,
  Waste,
  SaveIngredient,
  SaveSupplier,
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
    /* ---------- a stocktake ---------- */
    if (b.action === 'count') {
      const changed = await transaction(async (c) => {
        let n = 0;

        for (const item of b.counts) {
          const current = await c.query(
            `SELECT coalesce(sum(quantity), 0) AS on_hand
               FROM stock_movements WHERE ingredient_id = $1`,
            [item.ingredientId]
          );

          const onHand = Number(current.rows[0]?.on_hand ?? 0);
          const difference = item.onHand - onHand;

          // No change, nothing to record. A count that agrees is
          // still worth knowing, so it goes in as a zero-quantity
          // note rather than nothing at all - but the ledger refuses
          // zero, so it becomes a timestamp on the ingredient.
          if (Math.abs(difference) < 0.0001) {
            await c.query(
              `INSERT INTO stock_movements
                 (ingredient_id, kind, quantity, note, moved_by)
               VALUES ($1, 'counted', $2, $3, $4)`,
              [
                item.ingredientId,
                0.0001,
                'Counted, no change',
                user!.id,
              ]
            );
            continue;
          }

          await c.query(
            `INSERT INTO stock_movements
               (ingredient_id, kind, quantity, note, moved_by)
             VALUES ($1, 'counted', $2, $3, $4)`,
            [
              item.ingredientId,
              difference,
              b.note ??
                `Counted ${item.onHand}, was showing ${onHand.toFixed(2)}`,
              user!.id,
            ]
          );
          n++;
        }

        return n;
      });

      return NextResponse.json({ ok: true, adjusted: changed });
    }

    /* ---------- a delivery ---------- */
    if (b.action === 'receive') {
      const ing = await one<{ base_unit: string }>(
        'SELECT base_unit FROM ingredients WHERE id = $1',
        [b.ingredientId]
      );
      if (!ing) {
        return NextResponse.json({ error: 'Unknown item.' }, { status: 404 });
      }

      await transaction(async (c) => {
        const { rows } = await c.query(
          'SELECT convert_unit($1, $2, $3) AS q',
          [b.quantity, b.unit, ing.base_unit]
        );
        const inBase = Number(rows[0].q);

        await c.query(
          `INSERT INTO stock_movements
             (ingredient_id, kind, quantity, unit_cost, supplier_id,
              invoice_ref, expires_on, moved_by)
           VALUES ($1, 'received', $2, $3, $4, $5, $6, $7)`,
          [
            b.ingredientId, inBase,
            // Cost is stored per base unit so everything downstream
            // can multiply without converting again.
            b.unitCost !== null ? b.unitCost / (inBase / b.quantity) : null,
            b.supplierId, b.invoiceRef, b.expiresOn, user!.id,
          ]
        );

        // The most recent price is what costs a recipe.
        if (b.unitCost !== null) {
          await c.query(
            'UPDATE ingredients SET last_cost = $2 WHERE id = $1',
            [b.ingredientId, b.unitCost / (inBase / b.quantity)]
          );
        }
      });

      return NextResponse.json({ ok: true });
    }

    /* ---------- waste ---------- */
    if (b.action === 'waste') {
      await query(
        `INSERT INTO stock_movements
           (ingredient_id, kind, quantity, note, moved_by)
         VALUES ($1, 'wasted', $2, $3, $4)`,
        [b.ingredientId, -Math.abs(b.quantity), b.note, user!.id]
      );
      return NextResponse.json({ ok: true });
    }

    /* ---------- an item ---------- */
    if (b.action === 'ingredient') {
      if (b.id) {
        await query(
          `UPDATE ingredients
              SET name = $2, category = $3, storage = $4::storage_kind,
                  base_unit = $5, purchase_unit = $6, purchase_size = $7,
                  par_level = $8, reorder_to = $9, last_cost = $10,
                  supplier_id = $11, allergens = $12, is_active = $13,
                  notes = $14
            WHERE id = $1`,
          [
            b.id, b.name, b.category, b.storage, b.baseUnit,
            b.purchaseUnit, b.purchaseSize, b.parLevel, b.reorderTo,
            b.lastCost, b.supplierId, b.allergens, b.isActive, b.notes,
          ]
        );
      } else {
        await query(
          `INSERT INTO ingredients
             (name, category, storage, base_unit, purchase_unit,
              purchase_size, par_level, reorder_to, last_cost,
              supplier_id, allergens, is_active, notes)
           VALUES ($1,$2,$3::storage_kind,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            b.name, b.category, b.storage, b.baseUnit, b.purchaseUnit,
            b.purchaseSize, b.parLevel, b.reorderTo, b.lastCost,
            b.supplierId, b.allergens, b.isActive, b.notes,
          ]
        );
      }
      return NextResponse.json({ ok: true });
    }

    /* ---------- a supplier ---------- */
    if (b.id) {
      await query(
        `UPDATE suppliers
            SET name = $2, contact_name = $3, contact_email = $4,
                contact_phone = $5, lead_time_days = $6, notes = $7
          WHERE id = $1`,
        [
          b.id, b.name, b.contactName, b.contactEmail,
          b.contactPhone, b.leadTimeDays, b.notes,
        ]
      );
    } else {
      await query(
        `INSERT INTO suppliers
           (name, contact_name, contact_email, contact_phone,
            lead_time_days, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          b.name, b.contactName, b.contactEmail,
          b.contactPhone, b.leadTimeDays, b.notes,
        ]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('Cannot convert')
        ? err.message
        : 'Could not save that.';
    console.error('inventory failed:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
