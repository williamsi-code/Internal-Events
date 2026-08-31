import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import EnquiryThread from '@/components/EnquiryThread';
import { getSessionUser } from '@/lib/auth';
import { getEnquiry, getEnquiryMessages } from '@/lib/enquiries';

export const dynamic = 'force-dynamic';

export default async function MyEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const enquiry = await getEnquiry(id);
  if (!enquiry || enquiry.user_id !== user.id) notFound();

  const messages = await getEnquiryMessages(id, false);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '44rem' }}>
          <Link href="/my-requests" className="backlink-inline">
            &larr; All my requests
          </Link>

          <div className="detail">
            <div className="dhead">
              <div className="qtop">
                <span className="qref">{enquiry.reference_code}</span>
              </div>
              <h2>{enquiry.event_type || 'Your enquiry'}</h2>
              <div className="dmeta">
                <span>Asked {enquiry.created_at}</span>
                {enquiry.approx_date && <span>{enquiry.approx_date}</span>}
                {enquiry.approx_guests && (
                  <span>{enquiry.approx_guests} guests</span>
                )}
              </div>
            </div>

            <div className="sec">
              <div className="callout c-default">
                <strong>Where this stands</strong>
                {enquiry.status === 'answered'
                  ? 'The events office has replied. Read below and add anything else you need.'
                  : enquiry.status === 'closed'
                    ? 'This conversation is closed. Start a new enquiry if something else comes up.'
                    : enquiry.status === 'converted'
                      ? 'This became a booking. You can follow it under your requests.'
                      : 'With the events office. Someone will reply shortly.'}
              </div>
            </div>

            <div className="sec">
              <div className="sec-head">
                <h3>Conversation</h3>
              </div>
              <EnquiryThread
                enquiryId={id}
                messages={messages}
                isStaff={false}
                status={enquiry.status}
              />
            </div>

            {['answered', 'awaiting_staff', 'new'].includes(enquiry.status) && (
              <div className="sec">
                <div className="sec-head">
                  <h3>Ready to go ahead?</h3>
                </div>
                <p className="sec-note">
                  When you know what you want, start a booking. We will still
                  have this conversation on file.
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
            )}
          </div>
        </div>
      </main>
    </>
  );
}
