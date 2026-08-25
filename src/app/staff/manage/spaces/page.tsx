import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import SpacesEditor from '@/components/SpacesEditor';
import { getSessionUser } from '@/lib/auth';
import { listAdminSpaces } from '@/lib/admin';

export const metadata = { title: 'Event spaces - back office' };
export const dynamic = 'force-dynamic';

export default async function ManageSpacesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const spaces = await listAdminSpaces();

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Event spaces</h1>
            <p className="lede">
              Capacities shown here appear on the public spaces page and in the
              intake form. A space that is no longer bookable should be made
              unavailable rather than removed, so past events keep their
              location.
            </p>
          </div>
          <SpacesEditor spaces={spaces} />
        </div>
      </main>
    </>
  );
}
