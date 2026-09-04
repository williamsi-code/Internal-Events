import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import RecurringBooking from '@/components/RecurringBooking';
import SpaceClosures from '@/components/SpaceClosures';
import { getSessionUser } from '@/lib/auth';
import { listSchedulableSpaces } from '@/lib/scheduler';
import { listSeries, listClosures } from '@/lib/scheduler-extras';

export const metadata = { title: 'Scheduler settings - back office' };
export const dynamic = 'force-dynamic';

export default async function SchedulerAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [spaces, series, closures] = await Promise.all([
    listSchedulableSpaces(),
    listSeries(),
    listClosures(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '62rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Recurring bookings and closures</h1>
            <p className="lede">
              Standing meetings that repeat, and rooms taken out of service for
              maintenance or renovation.
            </p>
          </div>

          <h2 className="bo-heading">Rooms out of service</h2>
          <SpaceClosures spaces={spaces} closures={closures} />

          <h2 className="bo-heading" style={{ marginTop: '2rem' }}>
            Recurring bookings
          </h2>

          {series.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Room</th>
                  <th>Pattern</th>
                  <th className="num">Dates</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="admin-name">{s.title}</span>
                      <span className="admin-sub">
                        {s.start_time} {'\u2013'} {s.end_time}
                      </span>
                      {s.next_date && (
                        <span className="admin-sub">Next {s.next_date}</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-sub">{s.space_name}</span>
                    </td>
                    <td>
                      <span className="admin-sub">
                        {s.kind.replace(/_/g, ' ')}
                        <br />
                        {s.starts_on} to {s.ends_on}
                      </span>
                    </td>
                    <td className="num">{s.occurrences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <RecurringBooking spaces={spaces} />
        </div>
      </main>
    </>
  );
}
