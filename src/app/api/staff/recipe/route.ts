import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Saving a recipe.
 *
 * The whole recipe in one call: heading, components and steps
 * together. Entering several hundred of these means every extra
 * round trip is felt, and a half-saved recipe is worse than none.
 *
 * New ingredients can be created inline. Stopping to define an
 * ingredient before you can use it is exactly the friction that
 * makes people give up on the third recipe.
 */

const Component = z.object({
  ingredientId: z.string().uuid().nullable(),
  subRecipeId: z.string().uuid().nullable(),
  // Where the ingredient does not exist yet.
  newIngredientName: z.string().max(160).nullable().optional(),
  newIngredientUnit: z.string().max(20).nullable().optional(),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().max(20),
  preparation: z.string().max(200).nullable(),
  isOptional: z.boolean(),
});

const Save = z.object({
  action: z.literal('save'),
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  menuItemId: z.string().uuid().nullable(),
  yieldQuantity: z.number().positive().max(100_000),
  yieldUnit: z.string().max(20),
  serves: z.number().int().positive().max(10_000).nullable(),
  prepMinutes: z.number().int().min(0).max(10_000).nullable(),
  cookMinutes: z.number().int().min(0).max(10_000).nullable(),
  restMinutes: z.number().int().min(0).max(10_000).nullable(),
  method: z.string().max(20_000).nullable(),
  chefNotes: z.string().max(4000).nullable(),
  scaleNotes: z.string().max(4000).nullable(),
  isActive: z.boolean(),
  components: z.array(Component).max(120),
  steps: z
    .array(
      z.object({
        instruction: z.string().min(1).max(2000),
        minutes: z.number().int().min(0).max(10_000).nullable(),
        station: z.string().max(60).nullable(),
      })
    )
    .max(60),
});

const Duplicate = z.object({
  action: z.literal('duplicate'),
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
});

const Remove = z.object({
  action: z.literal('delete'),
  id: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [Save, Duplicate, Remove]);

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
      { error: 'Check the recipe and try again.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  try {
    if (b.action === 'delete') {
      // Deactivated rather than deleted: another recipe may use it as
      // a component, and an event last month was costed against it.
      await query('UPDATE recipes SET is_active = false WHERE id = $1', [b.id]);
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'duplicate') {
      const newId = await transaction(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO recipes
             (name, menu_item_id, yield_quantity, yield_unit, serves,
              prep_minutes, cook_minutes, rest_minutes,
              method, chef_notes, scale_notes, created_by)
           SELECT $2, NULL, yield_quantity, yield_unit, serves,
                  prep_minutes, cook_minutes, rest_minutes,
                  method, chef_notes, scale_notes, $3
             FROM recipes WHERE id = $1
           RETURNING id`,
          [b.id, b.name, user!.id]
        );
        const id = rows[0].id;

        await c.query(
          `INSERT INTO recipe_components
             (recipe_id, ingredient_id, sub_recipe_id, quantity, unit,
              preparation, is_optional, sort_order)
           SELECT $2, ingredient_id, sub_recipe_id, quantity, unit,
                  preparation, is_optional, sort_order
             FROM recipe_components WHERE recipe_id = $1`,
          [b.id, id]
        );

        await c.query(
          `INSERT INTO recipe_steps
             (recipe_id, step_number, instruction, minutes, station)
           SELECT $2, step_number, instruction, minutes, station
             FROM recipe_steps WHERE recipe_id = $1`,
          [b.id, id]
        );

        return id;
      });

      return NextResponse.json({ ok: true, id: newId });
    }

    /* ---------- save ---------- */
    const recipeId = await transaction(async (c) => {
      let id = b.id;

      if (id) {
        await c.query(
          `UPDATE recipes
              SET name = $2, menu_item_id = $3,
                  yield_quantity = $4, yield_unit = $5, serves = $6,
                  prep_minutes = $7, cook_minutes = $8, rest_minutes = $9,
                  method = $10, chef_notes = $11, scale_notes = $12,
                  is_active = $13, updated_at = now()
            WHERE id = $1`,
          [
            id, b.name, b.menuItemId, b.yieldQuantity, b.yieldUnit, b.serves,
            b.prepMinutes, b.cookMinutes, b.restMinutes,
            b.method, b.chefNotes, b.scaleNotes, b.isActive,
          ]
        );
      } else {
        const { rows } = await c.query(
          `INSERT INTO recipes
             (name, menu_item_id, yield_quantity, yield_unit, serves,
              prep_minutes, cook_minutes, rest_minutes,
              method, chef_notes, scale_notes, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id`,
          [
            b.name, b.menuItemId, b.yieldQuantity, b.yieldUnit, b.serves,
            b.prepMinutes, b.cookMinutes, b.restMinutes,
            b.method, b.chefNotes, b.scaleNotes, b.isActive, user!.id,
          ]
        );
        id = rows[0].id;
      }

      // Components and steps are replaced wholesale. A recipe is one
      // document, not a set of independently edited rows.
      await c.query('DELETE FROM recipe_components WHERE recipe_id = $1', [id]);
      await c.query('DELETE FROM recipe_steps WHERE recipe_id = $1', [id]);

      let order = 0;
      for (const comp of b.components) {
        let ingredientId = comp.ingredientId;

        // Create the ingredient if this is the first time anyone has
        // needed it. Costing and par levels come later; what matters
        // now is not blocking the typing.
        if (!ingredientId && !comp.subRecipeId && comp.newIngredientName) {
          const existing = await c.query(
            'SELECT id FROM ingredients WHERE lower(name) = lower($1)',
            [comp.newIngredientName.trim()]
          );

          if (existing.rows[0]) {
            ingredientId = existing.rows[0].id;
          } else {
            const { rows } = await c.query(
              `INSERT INTO ingredients (name, base_unit)
               VALUES ($1, $2)
               RETURNING id`,
              [
                comp.newIngredientName.trim(),
                comp.newIngredientUnit || comp.unit || 'each',
              ]
            );
            ingredientId = rows[0].id;
          }
        }

        if (!ingredientId && !comp.subRecipeId) continue;

        await c.query(
          `INSERT INTO recipe_components
             (recipe_id, ingredient_id, sub_recipe_id, quantity, unit,
              preparation, is_optional, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id, ingredientId, comp.subRecipeId, comp.quantity, comp.unit,
            comp.preparation, comp.isOptional, order++,
          ]
        );
      }

      let stepNumber = 1;
      for (const step of b.steps) {
        await c.query(
          `INSERT INTO recipe_steps
             (recipe_id, step_number, instruction, minutes, station)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, stepNumber++, step.instruction, step.minutes, step.station]
        );
      }

      return id;
    });

    // The cost is worth returning: it is the first thing anyone wants
    // to know once the ingredients are in.
    const cost = await one<{ cost: string | null }>(
      'SELECT recipe_cost($1)::text AS cost',
      [recipeId]
    );

    return NextResponse.json({
      ok: true,
      id: recipeId,
      cost: cost?.cost ?? null,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('Cannot convert')
        ? err.message
        : 'Could not save the recipe.';
    console.error('recipe save failed:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
