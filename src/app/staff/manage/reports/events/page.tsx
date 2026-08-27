import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import EventExplorer from '@/components/EventExplorer';
import { getSessionUser } from '@/lib/auth';
import { searchEvents } from '@/lib/reports';
import { listSchedulableSpaces } from '@/lib/scheduler';

export const metadata = { title: 'Event explorer' };
export const dynamic = 'force-dynamic';

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sp = await searchParams;

  const [events, spaces] = await Promise.all([
    searchEvents({
      from: sp.from,
      to: sp.to,
      classification: sp.classification,
      status: sp.status,
      spaceId: sp.spaceId,
      department: sp.department,
      foodSource: sp.foodSource,
      search: sp.search,
    }),
    listSchedulableSpaces(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '76rem' }}>
          <Link href="/staff/manage/reports" className="backlink-inline">
            &larr; Reports
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Event explorer</h1>
            <p className="lede">
              Every event, filterable. Actual cost only appears once an event
              has been closed out, so an open event shows what was charged but
              not what it cost.
            </p>
          </div>

          <EventExplorer
            events={events}
            spaces={spaces}
            filters={sp as Record<string, string>}
          />
        </div>
      </main>
    </>
  );
}
