import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import EnquiryThread from '@/components/EnquiryThread';
import { getSessionUser } from '@/lib/auth';
import { getEnquiry, getEnquiryMessages } from '@/lib/enquiries';

export const dynamic = 'force-dynamic';

export default async function StaffEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const enquiry = await getEnquiry(id);
  if (!enquiry) notFound();

  const messages = await getEnquiryMessages(id, true);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '48rem' }}>
          <Link href="/staff/enquiries" className="backlink-inline">
            &larr; All enquiries
          </Link>

          <div className="detail">
            <div className="dhead">
              <div className="qtop">
                <span className="qref">{enquiry.reference_code}</span>
                <span className="pill p-type">{enquiry.status}</span>
              </div>
              <h2>{enquiry.event_type || 'General enquiry'}</h2>
              <div className="dmeta">
                <span>{enquiry.name}</span>
                <span>{enquiry.email}</span>
                {enquiry.phone && <span>{enquiry.phone}</span>}
                {enquiry.organization && <span>{enquiry.organization}</span>}
              </div>
            </div>

            <div className="sec">
              <div className="submission">
                <dl>
                  {enquiry.approx_date && (
                    <>
                      <dt>Roughly when</dt>
                      <dd>{enquiry.approx_date}</dd>
                    </>
                  )}
                  {enquiry.approx_guests && (
                    <>
                      <dt>Roughly how many</dt>
                      <dd>{enquiry.approx_guests}</dd>
                    </>
                  )}
                  <dt>Asked</dt>
                  <dd>{enquiry.created_at}</dd>
                </dl>
              </div>

              {!enquiry.user_id && (
                <div className="callout c-warn" style={{ marginTop: '1rem' }}>
                  <strong>No account attached</strong>
                  This enquiry predates sign-in, so they cannot see replies here.
                  Reply by email to {enquiry.email}.
                </div>
              )}
            </div>

            <div className="sec">
              <div className="sec-head">
                <h3>Conversation</h3>
              </div>
              <EnquiryThread
                enquiryId={id}
                messages={messages}
                isStaff
                status={enquiry.status}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
