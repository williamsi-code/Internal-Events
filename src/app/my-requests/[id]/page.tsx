import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import RequesterActions from '@/components/RequesterActions';
import HeadcountForm from '@/components/HeadcountForm';
import RequesterPayments from '@/components/RequesterPayments';
import { getSessionUser } from '@/lib/auth';
import { getMyRequest, getVisibleMessages } from '@/lib/requests';
import { getPayments, getPaymentConfig } from '@/lib/payments';

export const dynamic = 'force-dynamic';

const STATUS_NOTE: Record<string, string> = {
  submitted:
    'Your request is with the events office. They will confirm how it is classified before anything is booked.',
  under_review: 'The events office is reviewing your request.',
  info_requested:
    'The events office has asked you a question. Your reply is needed before this can move forward.',
  classified:
    'Your event has been classified. Please review and confirm below.',
  details_pending:
    'Next, choose your menu and confirm how the room should be set up.',
  pending_final_review:
    'Your details are with the events office for a final check. You will hear back shortly.',
  confirmed: 'Your event is confirmed on the campus schedule.',
  completed: 'This event has taken place.',
  cancelled: 'This request was cancelled.',
  denied: 'This request could not be accommodated.',
};

export default async function MyRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const request = await getMyRequest(id, user.id);
  if (!request) notFound();

  const [messages, payments, payConfig] = await Promise.all([
    getVisibleMessages(id),
    getPayments(id),
    getPaymentConfig(),
  ]);

  const eventDate = new Date(request.event_date + 'T00:00:00');

  // The count is only worth asking for once the event is actually
  // going ahead - before that the number would be guesswork on a
  // request that may not happen.
  const showHeadcount =
    ['confirmed', 'pending_final_review'].includes(request.status) &&
    eventDate.getTime() >= Date.now() - 86_400_000;

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '48rem' }}>
          <Link href="/my-requests" className="backlink-inline">
            &larr; All my requests
          </Link>

          <div className="detail">
            <div className="dhead">
              <div className="qtop">
                <span className="qref">{request.reference_code}</span>
              </div>
              <h2>{request.event_name}</h2>
              <div className="dmeta">
                <span>
                  {eventDate.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {request.start_time && (
                  <span>
                    {request.start_time} {'\u2013'} {request.end_time}
                  </span>
                )}
                <span>
                  {request.space_building
                    ? `${request.space_building} \u2014 ${request.space_name}`
                    : request.space_name ?? request.location_freetext}
                </span>
                <span>
                  {request.final_attendance ?? request.estimated_attendance} guests
                </span>
              </div>
            </div>

            <div className="sec">
              <div className="callout c-default">
                <strong>Where this stands</strong>
                {STATUS_NOTE[request.status] ?? request.status}
              </div>
              <div className="submission">
                <dl>
                  <dt>Event type</dt>
                  <dd>{request.event_type_name ?? request.event_type_other}</dd>
                  <dt>Purpose</dt>
                  <dd>{request.event_purpose}</dd>
                </dl>
              </div>
            </div>

            {showHeadcount && <HeadcountForm request={request} />}

            <RequesterPayments payments={payments} config={payConfig} />

            <RequesterActions request={request} messages={messages} />
          </div>
        </div>
      </main>
    </>
  );
}
