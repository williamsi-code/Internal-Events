import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import ScheduleCalendar from '@/components/ScheduleCalendar';
import { getSessionUser } from '@/lib/auth';
import {
  listBookings,
  listSchedulableSpaces,
  listConflicts,
} from '@/lib/scheduler';

export const metadata = { title: 'Schedule' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sp = await searchParams;
  const now = new Date();
  const year = sp.y ? Number(sp.y) : now.getFullYear();
  const month = sp.m !== undefined ? Number(sp.m) : now.getMonth();

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const [bookings, spaces, conflicts] = await Promise.all([
    listBookings(monthStart),
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
        <div className="shell" style={{ maxWidth: '76rem' }}>
          <ScheduleCalendar
            bookings={bookings}
            spaces={spaces}
            conflicts={conflicts}
            year={year}
            month={month}
          />
        </div>
      </main>
    </>
  );
}
