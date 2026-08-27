import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { getCatererSummary } from '@/lib/caterers';

export const metadata = { title: 'Back office' };
export const dynamic = 'force-dynamic';

export default async function ManagePage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const caterers = await getCatererSummary();
  const pending = caterers?.pending ?? 0;

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Back office</h1>
          <p className="lede">
            Everything the request workflow reads from, and everything it
            produces. Changes here appear on the public pages and in new
            requests immediately.
          </p>
        </div>
        <div className="shell">
          <div className="tiles">
            <Link href="/staff/manage/reports" className="tile primary">
              <h3>Reports</h3>
              <p>
                The quarterly leadership report, and a filterable view of every
                event with CSV export.
              </p>
            </Link>
            <Link href="/staff/manage/menu" className="tile">
              <h3>Catering menu</h3>
              <p>
                Items, descriptions, minimums, allergens, and the four price
                tiers. Price changes take effect tomorrow and leave existing
                quotes alone.
              </p>
            </Link>
            <Link href="/staff/manage/spaces" className="tile">
              <h3>Event spaces</h3>
              <p>
                Rooms, capacities, facility rates, and whether catering is
                permitted. Spaces are hidden rather than deleted, so past events
                keep their location.
              </p>
            </Link>
            <Link href="/staff/manage/caterers" className="tile">
              <h3>
                Approved caterers
                {pending > 0 && (
                  <span className="tile-badge">{pending} waiting</span>
                )}
              </h3>
              <p>
                Who may bring food onto campus. Applications land here, and
                lapsed insurance removes a caterer from the list automatically.
              </p>
            </Link>
            <Link href="/staff/manage/policies" className="tile">
              <h3>Policy pages</h3>
              <p>
                Internal and external event policies, caterer requirements, and
                the donated food policy.
              </p>
            </Link>
            <Link href="/staff/manage/people" className="tile">
              <h3>People and access</h3>
              <p>
                Who can reach the queue, the schedule, and this back office.
                Everyone else can only submit and track their own events.
              </p>
            </Link>
          </div>

          <div className="callout c-default" style={{ marginTop: '1.5rem' }}>
            <strong>Event types and classification are not edited here</strong>
            The classification matrix lives in the database and changes rarely.
            Editing it affects how events are classified, so it is deliberately
            a deliberate act rather than a screen anyone can reach.
          </div>
        </div>
      </main>
    </>
  );
}
