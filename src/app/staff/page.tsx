import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import QueueList from '@/components/QueueList';
import { getSessionUser } from '@/lib/auth';
import { listQueue, getQueueCounts } from '@/lib/queue';

export const metadata = { title: 'Request queue' };
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [rows, counts] = await Promise.all([listQueue(), getQueueCounts()]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Request queue</h1>
          <p className="lede">
            In the order it should be worked rather than by date. An event in
            March that needs classifying today matters more than one next week
            that is already settled.
          </p>
        </div>

        <div className="shell">
          <div className="cap-facts">
            <div
              className={`cap-fact${(counts?.needs_us ?? 0) > 0 ? ' warn' : ''}`}
            >
              <span className="cap-n">{counts?.needs_us ?? 0}</span>
              <span className="cap-l">need you</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{counts?.waiting_on_them ?? 0}</span>
              <span className="cap-l">waiting on them</span>
            </div>
            {(counts?.clashes ?? 0) > 0 && (
              <div className="cap-fact bad">
                <span className="cap-n">{counts?.clashes}</span>
                <span className="cap-l">room already taken</span>
              </div>
            )}
            {(counts?.oldest_waiting ?? 0) > 2 && (
              <div className="cap-fact warn">
                <span className="cap-n">{counts?.oldest_waiting}</span>
                <span className="cap-l">days, the longest wait</span>
              </div>
            )}
          </div>

          <QueueList rows={rows} />

          <p className="sub" style={{ marginTop: '1.5rem' }}>
            <Link href="/staff/schedule">The schedule</Link> shows the same
            events by room and time;{' '}
            <Link href="/staff/kitchen">the catering schedule</Link> shows what
            the kitchen has on.
          </p>
        </div>
      </main>
    </>
  );
}
