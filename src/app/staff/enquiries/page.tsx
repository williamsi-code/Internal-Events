import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';
import { listOpenEnquiries } from '@/lib/enquiries';

export const metadata = { title: 'Enquiries' };
export const dynamic = 'force-dynamic';

const STATUS_PILL: Record<string, [string, string]> = {
  new: ['p-info', 'New'],
  awaiting_staff: ['p-info', 'They replied'],
  answered: ['p-submitted', 'Waiting on them'],
};

export default async function EnquiriesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const enquiries = await listOpenEnquiries();
  const needsUs = enquiries.filter((e) =>
    ['new', 'awaiting_staff'].includes(e.status)
  );

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Enquiries</h1>
          <p className="lede">
            People asking questions who are not yet ready to book. Replying here
            keeps the conversation where they can see it, rather than in an
            inbox neither side can search later.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '60rem' }}>
          <div className="cap-facts" style={{ marginBottom: '1.5rem' }}>
            <div className={`cap-fact${needsUs.length > 0 ? ' warn' : ''}`}>
              <span className="cap-n">{needsUs.length}</span>
              <span className="cap-l">waiting on us</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">
                {enquiries.filter((e) => e.status === 'answered').length}
              </span>
              <span className="cap-l">waiting on them</span>
            </div>
          </div>

          {enquiries.length === 0 ? (
            <div className="card">
              <h2>Nothing open</h2>
              <p className="hint">Every enquiry has been answered or closed.</p>
            </div>
          ) : (
            <div className="queue">
              {enquiries.map((e) => {
                const [cls, label] = STATUS_PILL[e.status] ?? [
                  'p-submitted',
                  e.status,
                ];
                return (
                  <Link
                    href={`/staff/enquiries/${e.id}`}
                    className="qcard"
                    key={e.id}
                  >
                    <div className="qtop">
                      <span className="qref">{e.reference_code}</span>
                      <span className={`pill ${cls}`}>{label}</span>
                    </div>
                    <div className="qname">
                      {e.event_type || 'General enquiry'}
                    </div>
                    <div className="qmeta">
                      {e.name}
                      {e.organization ? ` \u00b7 ${e.organization}` : ''}
                      {e.approx_date ? ` \u00b7 ${e.approx_date}` : ''}
                      {e.approx_guests
                        ? ` \u00b7 ${e.approx_guests} guests`
                        : ''}
                    </div>
                    <div className="qflags">
                      {e.unread_from_them > 0 && (
                        <span className="pill p-info">Unread reply</span>
                      )}
                      {e.status !== 'answered' && e.days_since_activity > 2 && (
                        <span className="pill p-overdue">
                          {e.days_since_activity} days without a reply
                        </span>
                      )}
                      <span className="pill p-type">
                        Asked {e.created_at}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
