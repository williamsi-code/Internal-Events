import { query, one } from './db';

/**
 * Recipes.
 *
 * The keystone: a recipe turns a menu item into ingredients, which
 * makes scaling, costing and shopping possible. Everything else in
 * the catering system reads through here.
 *
 * Entering them is a large job, so the queries are shaped around
 * making that job quick rather than around the prettiest model.
 */

export interface RecipeSummary {
  id: string;
  name: string;
  menu_item_id: string | null;
  menu_item_name: string | null;
  category: string | null;
  yield_quantity: string;
  yield_unit: string;
  serves: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  component_count: number;
  step_count: number;
  is_sub_recipe: boolean;
  used_by: number;
  cost: string | null;
  cost_per_serving: string | null;
  is_active: boolean;
  updated_at: string;
}

export async function listRecipes() {
  return query<RecipeSummary>(
    `SELECT r.id, r.name, r.menu_item_id,
            mi.name AS menu_item_name,
            c.name AS category,
            r.yield_quantity::text, r.yield_unit, r.serves,
            r.prep_minutes, r.cook_minutes,
            (SELECT count(*) FROM recipe_components rc
              WHERE rc.recipe_id = r.id) AS component_count,
            (SELECT count(*) FROM recipe_steps rs
              WHERE rs.recipe_id = r.id) AS step_count,
            (r.menu_item_id IS NULL) AS is_sub_recipe,
            (SELECT count(*) FROM recipe_components rc
              WHERE rc.sub_recipe_id = r.id) AS used_by,
            CASE WHEN EXISTS (
              SELECT 1 FROM recipe_components rc
               WHERE rc.recipe_id = r.id
            ) THEN recipe_cost(r.id)::text END AS cost,
            CASE WHEN r.serves > 0 AND EXISTS (
              SELECT 1 FROM recipe_components rc
               WHERE rc.recipe_id = r.id
            ) THEN round(recipe_cost(r.id) / r.serves, 2)::text END
              AS cost_per_serving,
            r.is_active,
            to_char(r.updated_at, 'Mon FMDD, YYYY') AS updated_at
       FROM recipes r
       LEFT JOIN menu_items mi ON mi.id = r.menu_item_id
       LEFT JOIN menu_categories c ON c.id = mi.category_id
      ORDER BY r.is_active DESC, c.sort_order NULLS LAST, r.name`
  );
}

export interface RecipeComponent {
  id: string;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  name: string;
  quantity: string;
  unit: string;
  preparation: string | null;
  is_optional: boolean;
  sort_order: number;
  base_unit: string | null;
  last_cost: string | null;
  allergens: string[] | null;
  line_cost: string | null;
}

export interface RecipeStep {
  id: string;
  step_number: number;
  instruction: string;
  minutes: number | null;
  station: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  menu_item_id: string | null;
  menu_item_name: string | null;
  yield_quantity: string;
  yield_unit: string;
  serves: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
  method: string | null;
  chef_notes: string | null;
  scale_notes: string | null;
  is_active: boolean;
  cost: string | null;
  created_by_name: string | null;
  updated_at: string;
}

export async function getRecipe(id: string) {
  return one<Recipe>(
    `SELECT r.id, r.name, r.menu_item_id, mi.name AS menu_item_name,
            r.yield_quantity::text, r.yield_unit, r.serves,
            r.prep_minutes, r.cook_minutes, r.rest_minutes,
            r.method, r.chef_notes, r.scale_notes, r.is_active,
            CASE WHEN EXISTS (
              SELECT 1 FROM recipe_components rc WHERE rc.recipe_id = r.id
            ) THEN recipe_cost(r.id)::text END AS cost,
            u.full_name AS created_by_name,
            to_char(r.updated_at, 'Mon FMDD, YYYY') AS updated_at
       FROM recipes r
       LEFT JOIN menu_items mi ON mi.id = r.menu_item_id
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = $1`,
    [id]
  );
}

export async function getComponents(recipeId: string) {
  return query<RecipeComponent>(
    `SELECT rc.id, rc.ingredient_id, rc.sub_recipe_id,
            coalesce(i.name, sr.name) AS name,
            rc.quantity::text, rc.unit, rc.preparation,
            rc.is_optional, rc.sort_order,
            i.base_unit, i.last_cost::text, i.allergens,
            CASE
              WHEN i.id IS NOT NULL AND i.last_cost IS NOT NULL
                THEN round(
                  i.last_cost * convert_unit(rc.quantity, rc.unit, i.base_unit),
                  2
                )::text
            END AS line_cost
       FROM recipe_components rc
       LEFT JOIN ingredients i ON i.id = rc.ingredient_id
       LEFT JOIN recipes sr ON sr.id = rc.sub_recipe_id
      WHERE rc.recipe_id = $1
      ORDER BY rc.sort_order, rc.id`,
    [recipeId]
  );
}

export async function getSteps(recipeId: string) {
  return query<RecipeStep>(
    `SELECT id, step_number, instruction, minutes, station
       FROM recipe_steps
      WHERE recipe_id = $1
      ORDER BY step_number`,
    [recipeId]
  );
}

/** Ingredients flattened through sub-recipes, for the prep list. */
export async function getFlatIngredients(recipeId: string, scale = 1) {
  return query<{
    ingredient_id: string;
    ingredient_name: string;
    quantity: string;
    unit: string;
    storage: string;
  }>('SELECT * FROM recipe_ingredients_flat($1, $2)', [recipeId, scale]);
}

/* ------------------------------------------------------------
   The lists the editor needs
   ------------------------------------------------------------ */

export interface IngredientOption {
  id: string;
  name: string;
  category: string | null;
  base_unit: string;
  last_cost: string | null;
  allergens: string[];
}

export async function listIngredients() {
  return query<IngredientOption>(
    `SELECT id, name, category, base_unit, last_cost::text, allergens
       FROM ingredients
      WHERE is_active
      ORDER BY name`
  );
}

export interface UnitOption {
  code: string;
  label: string;
  system: string;
}

export async function listUnits() {
  return query<UnitOption>(
    'SELECT code, label, system::text FROM units ORDER BY sort_order'
  );
}

export interface MenuItemOption {
  id: string;
  name: string;
  category: string;
  has_recipe: boolean;
}

/** Menu items, flagged with whether a recipe already exists, so the
 *  gap is visible while choosing. */
export async function listMenuItemsForRecipes() {
  return query<MenuItemOption>(
    `SELECT mi.id, mi.name, c.name AS category,
            EXISTS (
              SELECT 1 FROM recipes r
               WHERE r.menu_item_id = mi.id AND r.is_active
            ) AS has_recipe
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
      WHERE mi.is_active AND c.is_active
      ORDER BY c.sort_order, mi.sort_order`
  );
}

export async function listSubRecipes(excludeId?: string) {
  return query<{ id: string; name: string; yield_quantity: string; yield_unit: string }>(
    `SELECT id, name, yield_quantity::text, yield_unit
       FROM recipes
      WHERE is_active AND ($1::uuid IS NULL OR id <> $1)
      ORDER BY name`,
    [excludeId ?? null]
  );
}

/** How much of the menu has a recipe. The number that says how far
 *  through the data entry the kitchen is. */
export async function getRecipeCoverage() {
  return one<{
    menu_items: number;
    with_recipe: number;
    percent: number;
    sub_recipes: number;
  }>(
    `SELECT
       count(*)::int AS menu_items,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM recipes r
          WHERE r.menu_item_id = mi.id AND r.is_active
       ))::int AS with_recipe,
       CASE WHEN count(*) > 0 THEN
         round(100.0 * count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM recipes r
            WHERE r.menu_item_id = mi.id AND r.is_active
         )) / count(*))::int
       ELSE 0 END AS percent,
       (SELECT count(*)::int FROM recipes
         WHERE menu_item_id IS NULL AND is_active) AS sub_recipes
       FROM menu_items mi
       JOIN menu_categories c ON c.id = mi.category_id
      WHERE mi.is_active AND c.is_active`
  );
}
