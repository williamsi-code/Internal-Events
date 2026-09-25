import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import StockCount from '@/components/StockCount';
import ShoppingList from '@/components/ShoppingList';
import { getSessionUser } from '@/lib/auth';
import {
  listStock,
  getShoppingList,
  getUpcomingNeeds,
  getStockSummary,
} from '@/lib/inventory';

export const metadata = { title: 'Inventory - back office' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sp = await searchParams;
  const view = sp.view === 'shopping' ? 'shopping' : 'count';

  const [items, shopping, upcoming, summary] = await Promise.all([
    listStock(),
    getShoppingList(),
    getUpcomingNeeds(14),
    getStockSummary(),
  ]);

  const money = (v: string | undefined) =>
    Number(v ?? 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Inventory</h1>
          <p className="lede">
            What is in the store, and what to order. Somebody walks the shelves
            and types what is there; nothing is deducted automatically, because
            a number that drifts is worse than no number.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '58rem' }}>
          <div className="cap-facts no-print">
            <div className="cap-fact">
              <span className="cap-n">{summary?.tracked ?? 0}</span>
              <span className="cap-l">items tracked</span>
            </div>
            <div
              className={`cap-fact${(summary?.below_par ?? 0) > 0 ? ' warn' : ''}`}
            >
              <span className="cap-n">{summary?.below_par ?? 0}</span>
              <span className="cap-l">below par</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{money(summary?.total_value)}</span>
              <span className="cap-l">on the shelves</span>
            </div>
            <div
              className={`cap-fact${(summary?.stale_counts ?? 0) > 0 ? ' warn' : ''}`}
            >
              <span className="cap-n">{summary?.stale_counts ?? 0}</span>
              <span className="cap-l">not counted in a month</span>
            </div>
          </div>

          <div className="filters no-print" role="group" aria-label="View">
            <Link
              href="/staff/manage/inventory?view=count"
              className="chip"
              aria-pressed={view === 'count'}
            >
              Count the stock
            </Link>
            <Link
              href="/staff/manage/inventory?view=shopping"
              className="chip"
              aria-pressed={view === 'shopping'}
            >
              What to order
              {shopping.length > 0 && (
                <span className="n">{shopping.length}</span>
              )}
            </Link>
            <Link href="/staff/manage/inventory/items" className="chip">
              Set up items
            </Link>
          </div>

          {view === 'count' ? (
            <StockCount items={items} />
          ) : (
            <ShoppingList items={shopping} upcoming={upcoming} />
          )}
        </div>
      </main>
    </>
  );
}
