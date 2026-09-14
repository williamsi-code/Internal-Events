import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import RequesterActions from '@/components/RequesterActions';
import HeadcountForm from '@/components/HeadcountForm';
import RequesterPayments from '@/components/RequesterPayments';
import RequestLayouts from '@/components/RequestLayouts';
import CapacityAlternative from '@/components/CapacityAlternative';
import CapacityStatus from '@/components/CapacityStatus';
import RequesterReferrals from '@/components/RequesterReferrals';
import { getSessionUser } from '@/lib/auth';
import { getMyRequest, getVisibleMessages } from '@/lib/requests';
import { getPayments, getPaymentConfig } from '@/lib/payments';
import { getCapacityState } from '@/lib/capacity-state';
import { getReferrals } from '@/lib/referrals';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUS_NOTE: Record<string, string> = {
  submitted:
    'Your request is with the events office. They will confirm how it is classified before anything is booked.',
  under_review: 'The events office is reviewing your request.',
  info_requested:
    'The events office has asked you something. Your reply is needed before this can move forward.',
  classified:
    'Your event has been classified. Please review and confirm below.',
  details_pending:
    'Next, confirm the details of your event.',
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

  const [messages, payments, payConfig, capacity, central, referrals] =
    await Promise.all([
      getVisibleMessages(id),
      getPayments(id),
      getPaymentConfig(),
      getCapacityState(id),
      one<{ has_central: boolean; keeps_room: boolean }>(
        `SELECT has_central_dining($1) AS has_central,
                (SELECT keeps_room_after_decline
                   FROM event_requests WHERE id = $1) AS keeps_room`,
        [id]
      ),
      getReferrals(id),
    ]);

  const hasCentral = central?.has_central ?? true;
  const eventDate = new Date(request.event_date + 'T00:00:00');

  // A guest count exists so the kitchen can produce the right amount
  // of food. Without catering there is nothing to produce, so asking
  // is busywork - and the deadline it carries is a deadline about
  // nothing.
  const showHeadcount =
    hasCentral &&
    ['confirmed', 'pending_final_review'].includes(request.status) &&
    eventDate.getTime() >= Date.now() - 86_400_000;

  const spaceLabel = request.space_building
    ? `${request.space_building} \u2014 ${request.space_name}`
    : (request.space_name ?? request.location_freetext);

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
                <span>{spaceLabel}</span>
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
                  {request.event_purpose && (
                    <>
                      <dt>Purpose</dt>
                      <dd>{request.event_purpose}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>

            {capacity && (
              <CapacityAlternative
                requestId={id}
                state={capacity}
                currentDate={request.event_date}
                currentSpace={request.space_name ?? null}
              />
            )}

            <RequesterReferrals
              referrals={referrals}
              keepsRoom={central?.keeps_room ?? false}
            />

            <CapacityStatus
              state={capacity}
              acknowledged={!!request.acknowledged_at}
              requestId={id}
              hasCentral={hasCentral}
            />

            <RequestLayouts requestId={id} isStaff={false} />

            {showHeadcount && <HeadcountForm request={request} />}

            <RequesterPayments payments={payments} config={payConfig} />

            <RequesterActions request={request} messages={messages} />
          </div>
        </div>
      </main>
    </>
  );
}
