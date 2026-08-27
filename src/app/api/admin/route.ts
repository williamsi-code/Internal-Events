import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Back office writes.
 *
 * One route, three entities, discriminated by `kind`. Reference data
 * is never destroyed here: spaces and menu items deactivate, and a
 * price change closes the current row and opens a new one so past
 * quotes stay explicable.
 */

const Space = z.object({
  kind: z.literal('space'),
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  building: z.string().max(120).nullable(),
  capacitySeated: z.number().int().min(0).max(10_000).nullable(),
  capacityStanding: z.number().int().min(0).max(10_000).nullable(),
  supportsCatering: z.boolean(),
  description: z.string().max(1000).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  facilityRateInternal: z.number().min(0).max(1_000_000),
  facilityRateAffiliated: z.number().min(0).max(1_000_000),
  facilityRateExternal: z.number().min(0).max(1_000_000),
  rateBasis: z.string().min(1).max(40),
});

const MenuItem = z.object({
  kind: z.literal('menuItem'),
  id: z.string().uuid().nullable(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).nullable(),
  unit: z.string().min(1).max(40),
  minimumQuantity: z.number().int().min(0).max(10_000).nullable(),
  allergenNotes: z.string().max(300).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  prices: z.object({
    internal_non_revenue: z.number().min(0).max(100_000),
    internal_revenue_generating: z.number().min(0).max(100_000),
    affiliated_cost_recovery: z.number().min(0).max(100_000),
    external_commercial: z.number().min(0).max(100_000),
  }),
});

const Page = z.object({
  kind: z.literal('page'),
  slug: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  intro: z.string().max(2000).nullable(),
  body: z.string().min(1).max(60_000),
  isPublished: z.boolean(),
});

const Body = z.discriminatedUnion('kind', [Space, MenuItem, Page]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check the values and try again.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  try {
    if (b.kind === 'space') {
      await transaction(async (c) => {
        if (b.id) {
          await c.query(
            `UPDATE spaces
                SET name=$2, building=$3, capacity_seated=$4,
                    capacity_standing=$5, supports_catering=$6,
                    description=$7, is_active=$8, sort_order=$9,
                    facility_rate_internal=$10,
                    facility_rate_affiliated=$11,
                    facility_rate_external=$12,
                    rate_basis=$13
              WHERE id=$1`,
            [b.id, b.name, b.building, b.capacitySeated, b.capacityStanding,
             b.supportsCatering, b.description, b.isActive, b.sortOrder,
             b.facilityRateInternal, b.facilityRateAffiliated,
             b.facilityRateExternal, b.rateBasis]
          );
        } else {
          await c.query(
            `INSERT INTO spaces
               (name, building, capacity_seated, capacity_standing,
                supports_catering, description, is_active, sort_order,
                facility_rate_internal, facility_rate_affiliated,
                facility_rate_external, rate_basis)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [b.name, b.building, b.capacitySeated, b.capacityStanding,
             b.supportsCatering, b.description, b.isActive, b.sortOrder,
             b.facilityRateInternal, b.facilityRateAffiliated,
             b.facilityRateExternal, b.rateBasis]
          );
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (b.kind === 'menuItem') {
      await transaction(async (c) => {
        let itemId = b.id;

        if (itemId) {
          await c.query(
            `UPDATE menu_items
                SET category_id=$2, name=$3, description=$4, unit=$5,
                    minimum_quantity=$6, allergen_notes=$7,
                    is_active=$8, sort_order=$9
              WHERE id=$1`,
            [itemId, b.categoryId, b.name, b.description, b.unit,
             b.minimumQuantity, b.allergenNotes, b.isActive, b.sortOrder]
          );
        } else {
          const { rows } = await c.query(
            `INSERT INTO menu_items
               (category_id, name, description, unit, minimum_quantity,
                allergen_notes, is_active, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id`,
            [b.categoryId, b.name, b.description, b.unit, b.minimumQuantity,
             b.allergenNotes, b.isActive, b.sortOrder]
          );
          itemId = rows[0].id;
        }

        // A price change closes today's row and opens a new one rather
        // than editing in place, so it stays possible to answer "what
        // did this cost in September".
        for (const [path, price] of Object.entries(b.prices)) {
          const { rows: existing } = await c.query(
            `SELECT id, unit_price FROM menu_item_prices
              WHERE menu_item_id=$1 AND path=$2::financial_path
                AND effective_from <= CURRENT_DATE
                AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
              ORDER BY effective_from DESC LIMIT 1`,
            [itemId, path]
          );

          const currentPrice = existing[0]
            ? Number(existing[0].unit_price)
            : null;
          if (currentPrice !== null && Math.abs(currentPrice - price) < 0.005) {
            continue;
          }

          if (existing[0]) {
            await c.query(
              `UPDATE menu_item_prices
                  SET effective_to = CURRENT_DATE + 1
                WHERE id = $1`,
              [existing[0].id]
            );
          }

          await c.query(
            `INSERT INTO menu_item_prices
               (menu_item_id, path, unit_price, effective_from)
             VALUES ($1, $2::financial_path, $3, CURRENT_DATE + 1)`,
            [itemId, path, price]
          );
        }
      });
      return NextResponse.json({ ok: true });
    }

    await transaction(async (c) => {
      await c.query(
        `UPDATE content_pages
            SET title=$2, intro=$3, body=$4, is_published=$5,
                updated_at=now(), updated_by=$6
          WHERE slug=$1`,
        [b.slug, b.title, b.intro, b.body, b.isPublished, user!.id]
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('admin save failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
