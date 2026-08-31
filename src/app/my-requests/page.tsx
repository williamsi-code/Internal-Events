import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { listMyRequests } from '@/lib/requests';
import { listMyEnquiries } from '@/lib/enquiries';
import { classificationLabel, type Classification } from '@/lib/classify';

export const metadata = { title: 'My requests' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'With the events office',
  under_review: 'Being reviewed',
  info_requested: 'Needs your reply',
  classified: 'Needs your confirmation',
  details_pending: 'Choose your menu',
  pending_final_review: 'Final check',
  confirmed: 'Confirmed',
  completed: 'Done',
  cancelled: 'Cancelled',
  denied: 'Not accommodated',
};

const NEEDS_YOU = [
  'info_requested',
  'classified',
  'details_pending',
];

export default async function MyRequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const [requests, enquiries] = await Promise.all([
    listMyRequests(user.id),
    listMyEnquiries(user.id),
  ]);

  const openEnquiries = enquiries.filter(
    (e) => !['closed', 'converted'].includes(e.status)
  );

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>My requests</h1>
          <p className="lede">
            Everything you have asked us about, and where each one stands.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '52rem' }}>
          {requests.length === 0 && enquiries.length === 0 ? (
            <div className="card">
              <h2>Nothing here yet</h2>
              <p className="hint">
                Start an event, place an order, or ask us a question.
              </p>
              <div className="actions">
                <Link
                  href="/start"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  Central College event
                </Link>
                <Link
                  href="/order"
                  className="btn btn-ghost"
                  style={{ textDecoration: 'none' }}
                >
                  Order catering
                </Link>
              </div>
            </div>
          ) : (
            <>
              {requests.length > 0 && (
                <>
                  <h2 className="bo-heading">Events</h2>
                  <div className="queue">
                    {requests.map((r) => {
                      const needsYou = NEEDS_YOU.includes(r.status);
                      return (
                        <Link
                          href={`/my-requests/${r.id}`}
                          className={`qcard${needsYou ? ' needs-you' : ''}`}
                          key={r.id}
                        >
                          <div className="qtop">
                            <span className="qref">{r.reference_code}</span>
                            <span
                              className={`pill ${
                                needsYou ? 'p-info' : 'p-type'
                              }`}
                            >
                              {STATUS_LABEL[r.status] ?? r.status}
                            </span>
                          </div>
                          <div className="qname">{r.event_name}</div>
                          <div className="qmeta">
                            {new Date(
                              r.event_date + 'T00:00:00'
                            ).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {' \u00b7 '}
                            {r.estimated_attendance} guests
                          </div>
                          {r.current_classification && (
                            <div className="qflags">
                              <span
                                className={`pill p-${r.current_classification}`}
                              >
                                {classificationLabel(
                                  r.current_classification as Classification
                                )}
                              </span>
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              {openEnquiries.length > 0 && (
                <>
                  <h2 className="bo-heading">Questions you have asked</h2>
                  <div className="queue">
                    {openEnquiries.map((e) => (
                      <Link
                        href={`/my-requests/enquiries/${e.id}`}
                        className={`qcard${
                          e.unread > 0 ? ' needs-you' : ''
                        }`}
                        key={e.id}
                      >
                        <div className="qtop">
                          <span className="qref">{e.reference_code}</span>
                          <span
                            className={`pill ${
                              e.unread > 0 ? 'p-info' : 'p-type'
                            }`}
                          >
                            {e.unread > 0
                              ? 'They replied'
                              : e.status === 'awaiting_staff'
                                ? 'With the events office'
                                : 'Answered'}
                          </span>
                        </div>
                        <div className="qname">
                          {e.event_type || 'General enquiry'}
                        </div>
                        <div className="qmeta">
                          Asked {e.created_at}
                          {e.approx_date ? ` \u00b7 ${e.approx_date}` : ''}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
