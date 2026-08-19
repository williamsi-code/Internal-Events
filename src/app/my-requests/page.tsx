import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { listMyRequests, type MyRequestRow } from '@/lib/requests';
import { classificationLabel } from '@/lib/classify';

export const metadata = { title: 'My requests' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'With the events office',
  under_review: 'With the events office',
  info_requested: 'Waiting on you',
  classified: 'Classified',
  details_pending: 'Confirmed - details next',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  denied: 'Declined',
};

function isPast(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Card({ r }: { r: MyRequestRow }) {
  const past = isPast(r.event_date);

  // A past event is no longer actionable, whatever the workflow says.
  const statusText = past
    ? ['completed', 'cancelled', 'denied'].includes(r.status)
      ? STATUS_LABEL[r.status]
      : 'Date has passed'
    : r.awaiting_you
      ? 'Needs your attention'
      : STATUS_LABEL[r.status] ?? r.status;

  const statusPill = past
    ? 'p-muted'
    : r.awaiting_you
      ? 'p-info'
      : 'p-submitted';

  return (
    <li className="qcard">
      <div className="qtop">
        <span className="qref">
          <Link href={`/my-requests/${r.id}`} className="stretched">
            {r.reference_code}
          </Link>
        </span>
        <span className={`pill ${statusPill}`}>{statusText}</span>
      </div>
      <div className="qname">{r.event_name}</div>
      <div className="qmeta">
        {fmt(r.event_date)}
        {' \u00b7 '}
        {r.estimated_attendance} guests
      </div>
      <div className="qflags">
        {r.current_classification ? (
          <>
            <span className="pill p-type">
              {classificationLabel(r.current_classification)}
            </span>
            {r.acknowledged_at && (
              <span className="pill p-classified">Confirmed</span>
            )}
          </>
        ) : (
          <span className="pill p-muted">Classification pending</span>
        )}
      </div>
    </li>
  );
}

export default async function MyRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const all = await listMyRequests(user.id);

  const past = all
    .filter((r) => isPast(r.event_date))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  const upcoming = all.filter((r) => !isPast(r.event_date));

  // What the requester came here to find goes first.
  const needsYou = upcoming
    .filter((r) => r.awaiting_you)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  const waiting = upcoming
    .filter((r) => !r.awaiting_you)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>My requests</h1>
          <p className="lede">
            Every event you have requested, and where each one stands.
          </p>
        </div>

        <div className="shell">
          {all.length === 0 ? (
            <div className="card">
              <h2>Nothing here yet</h2>
              <p className="hint">
                When you submit an event request it will appear here, along with
                its status and any messages from the events office.
              </p>
              <Link
                href="/start"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Start creating your event
              </Link>
            </div>
          ) : (
            <>
              {needsYou.length > 0 && (
                <section>
                  <h2 className="group-label">Needs your attention</h2>
                  <ul className="queue-list">
                    {needsYou.map((r) => (
                      <Card r={r} key={r.id} />
                    ))}
                  </ul>
                </section>
              )}

              {waiting.length > 0 && (
                <section>
                  <h2 className="group-label">Upcoming</h2>
                  <ul className="queue-list">
                    {waiting.map((r) => (
                      <Card r={r} key={r.id} />
                    ))}
                  </ul>
                </section>
              )}

              {past.length > 0 && (
                <section>
                  <h2 className="group-label">Past events</h2>
                  <ul className="queue-list">
                    {past.map((r) => (
                      <Card r={r} key={r.id} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}