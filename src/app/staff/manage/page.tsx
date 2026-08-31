import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { getCatererSummary } from '@/lib/caterers';
import { getCloseoutSummary } from '@/lib/closeout';

export const metadata = { title: 'Back office' };
export const dynamic = 'force-dynamic';

export default async function ManagePage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [caterers, closeout] = await Promise.all([
    getCatererSummary(),
    getCloseoutSummary(),
  ]);

  const pendingCaterers = caterers?.pending ?? 0;
  const outstandingCloseout = closeout?.outstanding ?? 0;

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Back office</h1>
          <p className="lede">
            Everything the events office runs on: the day-to-day work, the
            reference data the request workflow reads from, and the reports it
            produces.
          </p>
        </div>

        <div className="shell">
          <h2 className="bo-heading">Day to day</h2>
          <div className="tiles">
            <Link href="/staff" className="tile primary">
              <h3>Request queue</h3>
              <p>
                Everything submitted, with what needs classifying, what is
                awaiting final review, and what is flagged.
              </p>
            </Link>
            <Link href="/staff/schedule" className="tile">
              <h3>Scheduler</h3>
              <p>
                Every room across day, week and month. Tentative holds appear on
                acknowledgement and turn solid after final review.
              </p>
            </Link>
            <Link href="/staff/closeout" className="tile">
              <h3>
                Close out
                {outstandingCloseout > 0 && (
                  <span className="tile-badge">{outstandingCloseout} waiting</span>
                )}
              </h3>
              <p>
                Actual costs and attendance after an event. Everything in the
                quarterly report is built from these numbers.
              </p>
            </Link>
          </div>

          <h2 className="bo-heading">Reporting</h2>
          <div className="tiles">
            <Link href="/staff/manage/reports" className="tile">
              <h3>Reports</h3>
              <p>
                The quarterly leadership report, and a filterable view of every
                event with CSV export.
              </p>
            </Link>
          </div>

          <h2 className="bo-heading">What the system reads from</h2>
          <div className="tiles">
            <Link href="/staff/manage/menu" className="tile">
              <h3>Catering menu</h3>
              <p>
                Items, minimums, allergens and prices. External is the published
                rate; affiliated and internal derive from it at 60% and 30%.
              </p>
            </Link>
            <Link href="/staff/manage/spaces" className="tile">
              <h3>Event spaces</h3>
              <p>
                Rooms, capacities and facility rates. Spaces are hidden rather
                than deleted, so past events keep their location.
              </p>
            </Link>
            <Link href="/staff/manage/caterers" className="tile">
              <h3>
                Approved caterers
                {pendingCaterers > 0 && (
                  <span className="tile-badge">{pendingCaterers} waiting</span>
                )}
              </h3>
              <p>
                Who may bring food onto campus. Lapsed insurance removes a
                caterer from the list automatically.
              </p>
            </Link>
            <Link href="/staff/manage/policies" className="tile">
              <h3>Policy pages</h3>
              <p>
                Catering policies, external event policies, outside caterer
                requirements and the donated food policy, as published.
              </p>
            </Link>
          </div>

          <h2 className="bo-heading">Access</h2>
          <div className="tiles">
            <Link href="/staff/manage/people" className="tile">
              <h3>People and access</h3>
              <p>
                Who can reach the queue, the scheduler and this back office.
                Everyone else can only submit and track their own events.
              </p>
            </Link>
          </div>

          <div className="callout c-default" style={{ marginTop: '2rem' }}>
            <strong>Event types and classification are not edited here</strong>
            The classification matrix lives in the database and changes rarely.
            Editing it changes how events are classified, so it is deliberately
            a deliberate act rather than a screen anyone can reach.
          </div>
        </div>
      </main>
    </>
  );
}
