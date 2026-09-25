import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import RecipeEditor from '@/components/RecipeEditor';
import { getSessionUser } from '@/lib/auth';
import {
  getRecipe,
  getComponents,
  getSteps,
  listIngredients,
  listUnits,
  listMenuItemsForRecipes,
  listSubRecipes,
} from '@/lib/recipes';

export const metadata = { title: 'Recipe' };
export const dynamic = 'force-dynamic';

export default async function RecipeEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const isNew = id === 'new';
  const recipe = isNew ? null : await getRecipe(id);
  if (!isNew && !recipe) notFound();

  const [components, steps, ingredients, units, menuItems, subRecipes] =
    await Promise.all([
      isNew ? Promise.resolve([]) : getComponents(id),
      isNew ? Promise.resolve([]) : getSteps(id),
      listIngredients(),
      listUnits(),
      listMenuItemsForRecipes(),
      listSubRecipes(isNew ? undefined : id),
    ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '58rem' }}>
          <Link href="/staff/manage/recipes" className="backlink-inline">
            &larr; All recipes
          </Link>

          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>{recipe ? recipe.name : 'New recipe'}</h1>
            <p className="lede">
              {recipe
                ? `${recipe.menu_item_name ?? 'Made in-house'} \u00b7 last changed ${recipe.updated_at}`
                : 'Paste an ingredient list and correct what we get wrong. It is quicker than typing.'}
            </p>
          </div>

          <RecipeEditor
            recipe={recipe}
            components={components}
            steps={steps}
            ingredients={ingredients}
            units={units}
            menuItems={menuItems}
            subRecipes={subRecipes}
          />
        </div>
      </main>
    </>
  );
}
