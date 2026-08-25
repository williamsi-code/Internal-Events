import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import PeopleEditor from '@/components/PeopleEditor';
import { getSessionUser } from '@/lib/auth';
import { listPeople, listRoleChanges } from '@/lib/users';

export const metadata = { title: 'People - back office' };
export const dynamic = 'force-dynamic';

export default async function ManagePeoplePage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [people, history] = await Promise.all([
    listPeople(),
    listRoleChanges(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '68rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>People and access</h1>
            <p className="lede">
              Anyone can create an account and request an event. Access to the
              queue, the schedule, and the back office is granted here and
              nowhere else.
            </p>
          </div>
          <PeopleEditor
            people={people}
            history={history}
            currentUserId={user.id}
            isAdmin={user.roles.includes('admin')}
          />
        </div>
      </main>
    </>
  );
}
