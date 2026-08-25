import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import MenuEditor from '@/components/MenuEditor';
import { getSessionUser } from '@/lib/auth';
import { listAdminMenu, listCategories } from '@/lib/admin';

export const metadata = { title: 'Catering menu - back office' };
export const dynamic = 'force-dynamic';

export default async function ManageMenuPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [items, categories] = await Promise.all([
    listAdminMenu(),
    listCategories(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Catering menu</h1>
            <p className="lede">
              Four prices per item, one for each way an event can be charged.
              Which one a requester sees follows from how their event is
              classified.
            </p>
          </div>
          <MenuEditor items={items} categories={categories} />
        </div>
      </main>
    </>
  );
}
