import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import IngredientEditor from '@/components/IngredientEditor';
import { getSessionUser } from '@/lib/auth';
import { listStock, listSuppliers, listCategories } from '@/lib/inventory';
import { listUnits } from '@/lib/recipes';

export const metadata = { title: 'Stock items - back office' };
export const dynamic = 'force-dynamic';

export default async function ItemsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [items, suppliers, units, categories] = await Promise.all([
    listStock(),
    listSuppliers(),
    listUnits(),
    listCategories(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '58rem' }}>
          <Link href="/staff/manage/inventory" className="backlink-inline">
            &larr; Inventory
          </Link>

          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Stock items</h1>
            <p className="lede">
              What each item is, how it is counted, and when to reorder it.
              Items appear here on their own as recipes are written &mdash;
              this is where they get the rest of their detail.
            </p>
          </div>

          <IngredientEditor
            items={items}
            suppliers={suppliers}
            units={units}
            categories={categories}
          />
        </div>
      </main>
    </>
  );
}
