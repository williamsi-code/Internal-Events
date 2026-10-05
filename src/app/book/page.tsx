import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import ScheduleGrid from '@/components/ScheduleGrid';
import { getSessionUser } from '@/lib/auth';
import { bookingAccess } from '@/lib/campus';
import {
  listBookings,
  listSchedulableSpaces,
  listConflicts,
  getBusyDays,
} from '@/lib/scheduler';

export const metadata = { title: 'Book a room' };
export const dynamic = 'force-dynamic';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

/**
 * Booking a room, for people who are not events staff.
 *
 * The same grid the office uses, without the queue and the back
 * office around it. A Central address is the only credential needed:
 * the College already knows who they are.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in?next=/book');

  const access = bookingAccess(user);
  if (!access.canView) redirect('/start?need=setup');

  const sp = await searchParams;
  const view = sp.view === 'day' ? 'day' : 'week';
  const anchor =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? new Date(sp.date + 'T12:00:00')
      : new Date();

  const from = new Date(anchor);
  const to = new Date(anchor);
  if (view === 'day') {
    to.setDate(to.getDate() + 1);
  } else {
    from.setDate(from.getDate() - from.getDay());
    to.setDate(from.getDate() + 7);
  }

  const [bookings, spaces, conflicts, busyDays] = await Promise.all([
    listBookings(iso(from), iso(to)),
    listSchedulableSpaces(),
    listConflicts(),
    getBusyDays(iso(from), iso(to)),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <Link href="/start" className="backlink-inline">
            &larr; Something else
          </Link>
          <h1>Book a room</h1>
          <p className="lede">
            Click any free slot and it is yours. Times shown include setup and
            clearing, so a room is held for longer than the event itself runs.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '72rem' }}>
          {!access.confirmsImmediately && (
            <div className="callout c-default">
              <strong>Your bookings hold the room straight away</strong>
              The events office confirms them, usually the same day. If
              something clashes they will be in touch rather than simply
              cancelling.
            </div>
          )}

          <ScheduleGrid
            bookings={bookings}
            spaces={spaces}
            conflicts={conflicts}
            busyDays={busyDays}
            view={view}
            anchorIso={iso(anchor)}
            canEdit={access.canEdit}
            canBook={access.canBook}
          />

          <p className="sub" style={{ marginTop: '1.5rem' }}>
            Need food or a particular setup?{' '}
            <Link href="/start?need=food">Ask for an event instead</Link>, or
            book the room now and add catering to it afterwards.
          </p>
        </div>
      </main>
    </>
  );
}
