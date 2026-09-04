import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import ScheduleGrid from '@/components/ScheduleGrid';
import { getSessionUser } from '@/lib/auth';
import {
  listBookings,
  listSchedulableSpaces,
  listConflicts,
  getBusyDays,
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

  const canEdit =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  const canView = canEdit || user.roles.includes('schedule_viewer');

  // Security and facilities need to know what is happening in the
  // buildings. They do not need the queue, the menu, or anyone's
  // budget account.
  if (!canView) redirect('/');

  const sp = await searchParams;
  const view: View = ['day', 'week', 'month'].includes(sp.view ?? '')
    ? (sp.view as View)
    : 'week';

  const anchor =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? new Date(sp.date + 'T00:00:00')
      : new Date();

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

  const pickerFrom = new Date(anchor.getFullYear(), anchor.getMonth() - 3, 1);
  const pickerTo = new Date(anchor.getFullYear(), anchor.getMonth() + 4, 0);

  const [bookings, spaces, conflicts, busyDays] = await Promise.all([
    listBookings(iso(from), iso(to)),
    listSchedulableSpaces(),
    canEdit ? listConflicts() : Promise.resolve([]),
    getBusyDays(iso(pickerFrom), iso(pickerTo)),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Schedule</h1>
          <p className="lede">
            {canEdit
              ? 'Meeting venues by default. An event appears here tentatively once the requester confirms their classification, and becomes solid after final review.'
              : 'What is happening in the buildings. Meeting venues by default; other spaces are in the dropdown.'}
          </p>
        </div>
        <div className="shell" style={{ maxWidth: '84rem' }}>
          {!canEdit && (
            <p className="viewer-note">
              You have view access to the schedule. Times shown include setup
              and teardown, so a room is occupied for longer than its event
              runs.
            </p>
          )}
          <ScheduleGrid
            bookings={bookings}
            spaces={spaces}
            conflicts={conflicts}
            busyDays={busyDays}
            view={view}
            anchorIso={iso(anchor)}
            canEdit={canEdit}
          />
        </div>
      </main>
    </>
  );
}
