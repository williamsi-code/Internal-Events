import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import ScheduleGrid from '@/components/ScheduleGrid';
import { getSessionUser } from '@/lib/auth';
import {
  listBookings,
  listSchedulableSpaces,
  listConflicts,
} from '@/lib/scheduler';

export const metadata = { title: 'Schedule' };
export const dynamic = 'force-dynamic';

type View = 'day' | 'week' | 'month';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sp = await searchParams;
  const view: View = ['day', 'week', 'month'].includes(sp.view ?? '')
    ? (sp.view as View)
    : 'week';

  const anchor =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? new Date(sp.date + 'T00:00:00')
      : new Date();

  // Fetch exactly the range the view shows, plus a day either side so
  // a booking that runs past midnight still renders on both days.
  let from = new Date(anchor);
  let to = new Date(anchor);
  if (view === 'week') {
    from = new Date(anchor);
    from.setDate(anchor.getDate() - anchor.getDay());
    to = new Date(from);
    to.setDate(from.getDate() + 6);
  } else if (view === 'month') {
    from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }
  from.setDate(from.getDate() - 1);
  to.setDate(to.getDate() + 1);

  const [bookings, spaces, conflicts] = await Promise.all([
    listBookings(iso(from), iso(to)),
    listSchedulableSpaces(),
    listConflicts(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Schedule</h1>
          <p className="lede">
            Catering and events only. An event appears here tentatively once the
            requester confirms their classification, and becomes solid after
            final review. Two confirmed events cannot share a space.
          </p>
        </div>
        <div className="shell" style={{ maxWidth: '84rem' }}>
          <ScheduleGrid
            bookings={bookings}
            spaces={spaces}
            conflicts={conflicts}
            view={view}
            anchorIso={iso(anchor)}
          />
        </div>
      </main>
    </>
  );
}
