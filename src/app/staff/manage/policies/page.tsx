import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import PolicyEditor from '@/components/PolicyEditor';
import { getSessionUser } from '@/lib/auth';
import { listAdminPages } from '@/lib/admin';

export const metadata = { title: 'Policy pages - back office' };
export const dynamic = 'force-dynamic';

export default async function ManagePoliciesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const pages = await listAdminPages();

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '52rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Policy pages</h1>
            <p className="lede">
              These are the policies requesters read before submitting. Changes
              are published as soon as you save.
            </p>
          </div>
          <PolicyEditor pages={pages} />
        </div>
      </main>
    </>
  );
}
