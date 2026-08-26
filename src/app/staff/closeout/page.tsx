import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { listAwaitingCloseout, getCloseoutSummary } from '@/lib/closeout';
import { classificationLabel, type Classification } from '@/lib/classify';

export const metadata = { title: 'Close out' };
export const dynamic = 'force-dynamic';

export default async function CloseoutListPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [pending, summary] = await Promise.all([
    listAwaitingCloseout(),
    getCloseoutSummary(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Close out</h1>
          <p className="lede">
            Events that have happened and still need their actual costs
            recorded. Everything in the quarterly leadership report is built
            from these numbers, so a report is only as honest as this list is
            short.
          </p>
        </div>

        <div className="shell">
          <div className="cap-facts" style={{ marginBottom: '1.5rem' }}>
            <div className={`cap-fact${pending.length > 5 ? ' warn' : ''}`}>
              <span className="cap-n">{summary?.outstanding ?? 0}</span>
              <span className="cap-l">waiting to be closed</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{summary?.closed_this_month ?? 0}</span>
              <span className="cap-l">closed this month</span>
            </div>
            <div
              className={`cap-fact${
                (summary?.oldest_days ?? 0) > 30 ? ' bad' : ''
              }`}
            >
              <span className="cap-n">{summary?.oldest_days ?? 0}</span>
              <span className="cap-l">days since the oldest</span>
            </div>
            <div
              className={`cap-fact${
                (summary?.cost_capture_pct ?? 100) < 80 ? ' warn' : ''
              }`}
            >
              <span className="cap-n">{summary?.cost_capture_pct ?? 0}%</span>
              <span className="cap-l">cost capture, last 90 days</span>
            </div>
          </div>

          {(summary?.cost_capture_pct ?? 100) < 80 && (
            <div className="callout c-warn">
              <strong>Cost capture is below 80 percent</strong>
              True cost is understated and contribution margin looks better than
              it is. Worth catching up before the next quarterly report goes out.
            </div>
          )}

          {pending.length === 0 ? (
            <div className="card">
              <h2>Nothing outstanding</h2>
              <p className="hint">
                Every event that has happened has been closed out.
              </p>
            </div>
          ) : (
            <div className="queue">
              {pending.map((p) => (
                <Link
                  href={`/staff/${p.id}/closeout`}
                  className="qcard"
                  key={p.id}
                >
                  <div className="qtop">
                    <span className="qref">{p.reference_code}</span>
                    <span
                      className={`pill ${
                        p.days_since > 30
                          ? 'p-overdue'
                          : p.days_since > 14
                            ? 'p-headcount'
                            : 'p-submitted'
                      }`}
                    >
                      {p.days_since} day{p.days_since === 1 ? '' : 's'} ago
                    </span>
                  </div>
                  <div className="qname">{p.event_name}</div>
                  <div className="qmeta">
                    {new Date(p.event_date + 'T00:00:00').toLocaleDateString(
                      'en-US',
                      { month: 'short', day: 'numeric', year: 'numeric' }
                    )}
                    {' \u00b7 '}
                    {p.expected_attendance} guests
                    {' \u00b7 '}
                    {p.department_org}
                  </div>
                  <div className="qflags">
                    {p.classification && (
                      <span className={`pill p-${p.classification}`}>
                        {classificationLabel(p.classification as Classification)}
                      </span>
                    )}
                    <span className="pill p-type">
                      Quoted ${Number(p.quoted_total).toFixed(2)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
