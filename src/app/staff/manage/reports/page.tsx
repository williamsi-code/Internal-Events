import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { getCompleteness, listPeriods } from '@/lib/reports';

export const metadata = { title: 'Reports - back office' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const periods = await listPeriods();
  const now = new Date();
  const current =
    periods.find(
      (p) =>
        new Date(p.starts_on) <= now && new Date(p.ends_on + 'T23:59:59') >= now
    ) ?? periods[0];

  const completeness = current
    ? await getCompleteness(current.starts_on, current.ends_on)
    : null;

  const capture = Number(completeness?.cost_capture_pct ?? 0);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '58rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Reports</h1>
            <p className="lede">
              Everything here is built from what staff record as events move
              through. A report is only as good as the close-out behind it.
            </p>
          </div>

          {current && completeness && capture < 80 && (
            <div className="callout c-warn">
              <strong>
                Cost capture is {capture}% for {current.label}
              </strong>
              {completeness.events_in_period - completeness.with_actual_costs}{' '}
              event
              {completeness.events_in_period - completeness.with_actual_costs === 1
                ? ' has'
                : 's have'}{' '}
              no actual costs recorded. Until they do, true cost is understated
              and every margin looks better than it is.{' '}
              <Link href="/staff/closeout">Close them out</Link>.
            </div>
          )}

          <div className="tiles">
            <Link
              href={
                current
                  ? `/staff/manage/reports/quarterly?from=${current.starts_on}&to=${current.ends_on}`
                  : '/staff/manage/reports/quarterly'
              }
              className="tile primary"
            >
              <h3>Quarterly leadership report</h3>
              <p>
                Activity, institutional support, partnership support, external
                contribution, capacity, lost business, and exceptions. Printable
                for circulation.
              </p>
            </Link>
            <Link href="/staff/manage/reports/events" className="tile">
              <h3>Event explorer</h3>
              <p>
                Filter every event by date, classification, status, space,
                department, or food source. Export what you find to CSV.
              </p>
            </Link>
          </div>

          {current && completeness && (
            <section className="admin-section" style={{ marginTop: '2rem' }}>
              <h3 className="admin-h3">{current.label} at a glance</h3>
              <div className="cap-facts">
                <div className="cap-fact">
                  <span className="cap-n">{completeness.events_in_period}</span>
                  <span className="cap-l">events in period</span>
                </div>
                <div className="cap-fact">
                  <span className="cap-n">{completeness.closed_out}</span>
                  <span className="cap-l">closed out</span>
                </div>
                <div className={`cap-fact${capture < 80 ? ' warn' : ''}`}>
                  <span className="cap-n">{capture}%</span>
                  <span className="cap-l">cost capture</span>
                </div>
              </div>
            </section>
          )}

          <div className="callout c-default" style={{ marginTop: '1.5rem' }}>
            <strong>Periods are editable in the database</strong>
            The quarters listed assume a June fiscal year start. If Central&rsquo;s
            differs, correct the <code>reporting_periods</code> table. Any report
            can also be run against an arbitrary date range.
          </div>
        </div>
      </main>
    </>
  );
}
