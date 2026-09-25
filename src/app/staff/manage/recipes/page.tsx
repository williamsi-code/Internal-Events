import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import RecipeList from '@/components/RecipeList';
import { getSessionUser } from '@/lib/auth';
import { listRecipes, getRecipeCoverage } from '@/lib/recipes';

export const metadata = { title: 'Recipes - back office' };
export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [recipes, coverage] = await Promise.all([
    listRecipes(),
    getRecipeCoverage(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Recipes</h1>
          <p className="lede">
            What each menu item is made of. Recipes are what let an order be
            costed, scaled to a headcount, and turned into a shopping list.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '62rem' }}>
          {/* The number that says how far through this is, because it
              is a long job and progress is the thing that keeps it
              going. */}
          <div className="coverage">
            <div className="coverage-bar">
              <span
                className="coverage-fill"
                style={{ width: `${coverage?.percent ?? 0}%` }}
              />
            </div>
            <div className="coverage-text">
              <strong>
                {coverage?.with_recipe ?? 0} of {coverage?.menu_items ?? 0} menu
                items have a recipe
              </strong>
              <span>
                {coverage?.percent ?? 0}% done
                {coverage?.sub_recipes
                  ? ` \u00b7 ${coverage.sub_recipes} made in-house component${
                      coverage.sub_recipes === 1 ? '' : 's'
                    }`
                  : ''}
              </span>
            </div>
          </div>

          <div className="actions">
            <Link href="/staff/manage/recipes/new" className="btn btn-primary">
              Write a recipe
            </Link>
          </div>

          <RecipeList recipes={recipes} />
        </div>
      </main>
    </>
  );
}
