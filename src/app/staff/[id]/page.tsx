import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import DecisionPanel from '@/components/DecisionPanel';
import ChangeFlags from '@/components/ChangeFlags';
import CapacityPanel from '@/components/CapacityPanel';
import RequestActions from '@/components/RequestActions';
import FoodSourcePanel from '@/components/FoodSourcePanel';
import ReopenDetails from '@/components/ReopenDetails';
import PaymentPanel from '@/components/PaymentPanel';
import RequestLayouts from '@/components/RequestLayouts';
import CatererReferral from '@/components/CatererReferral';
import ShortNoticePanel from '@/components/ShortNoticePanel';
import { getSessionUser } from '@/lib/auth';
import { getRequest, getMessages } from '@/lib/requests';
import { changesSinceClassification } from '@/lib/changes';
import {
  getCapacityContext,
  listSameDayBookings,
  listAlternativeSpaces,
} from '@/lib/capacity';
import { getFoodSources, getFacilityCharge } from '@/lib/food-sources';
import { getDetailsLockState, getMenuHistory } from '@/lib/reopen';
import { getPayments, getPaymentConfig } from '@/lib/payments';
import { one } from '@/lib/db';
import { getReferrals, listReferrableCaterers } from '@/lib/referrals';
import { getShortNotice } from '@/lib/notice';

export const dynamic = 'force-dynamic';

const PARTY: Record<string, string> = {
  central: 'Central College',
  shared: 'Shared',
  outside: 'Outside party',
  unclear: 'Not sure',
  yes: 'Yes',
  no: 'No',
  unsure: 'Not sure',
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

export default async function RequestDetailPage({
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

  const request = await getRequest(id);
  if (!request) notFound();

  const messages = await getMessages(id);

  const changes = request.current_classification
    ? await changesSinceClassification(id)
    : [];

  const awaitingFinalReview = request.status === 'pending_final_review';

  const showCapacity =
    !!request.current_classification &&
    !['denied', 'cancelled', 'completed'].includes(request.status);

  const [capacityContext, sameDay, altSpaces] = showCapacity
    ? await Promise.all([
        getCapacityContext(id),
        listSameDayBookings(id),
        listAlternativeSpaces(id),
      ])
    : [null, [], []];

  const [foodSources, facility, lock, menuHistory, payments, payConfig, notice] =
    await Promise.all([
      getFoodSources(id),
      getFacilityCharge(id),
      getDetailsLockState(id),
      getMenuHistory(id),
      getPayments(id),
      getPaymentConfig(),
      getShortNotice(id),
    ]);

  // Nothing else on this request matters until the short-notice
  // question is answered, so everything below is held back while it
  // is outstanding.
  const noticePending =
    !!notice?.short_notice && notice.state === 'pending';

  // Suggesting a caterer only makes sense once we have said no. The
  // decline may sit on the capacity check or on the request itself.
  const declined =
    request.status === 'denied' ||
    capacityContext?.existing_outcome === 'declined';

   const [referrals, referrableCaterers, roomState] = declined
    ? await Promise.all([
        getReferrals(id),
        listReferrableCaterers(),
        one<{ keeps_room: boolean }>(
          'SELECT keeps_room_after_decline AS keeps_room FROM event_requests WHERE id = $1',
          [id]
        ),
      ])
    : [[], [], null];

  const eventDate = new Date(request.event_date + 'T00:00:00');
  const days = Math.round((eventDate.getTime() - Date.now()) / 86_400_000);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem' }}>
          <Link href="/staff" className="backlink-inline">
            &larr; Back to queue
          </Link>

          <div className="detail">
            <div className="dhead">
              <div className="qtop">
                <span className="qref">{request.reference_code}</span>
                <span
                  style={{
                    display: 'flex',
                    gap: '.5rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {awaitingFinalReview && (
                    <span className="pill p-final">Awaiting final review</span>
                  )}
                  {request.status === 'cancelled' && (
                    <span className="pill p-cancelled">Cancelled</span>
                  )}
                  {request.current_classification && (
                    <Link
                      href={`/staff/${id}/catering-sheet`}
                      className="sheet-link"
                    >
                      Catering sheet
                    </Link>
                  )}
                </span>
              </div>
              <h2>{request.event_name}</h2>
              <div className="dmeta">
                <span>
                  {eventDate.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {days >= 0 ? ` \u00b7 in ${days} days` : ` \u00b7 ${-days} days ago`}
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
                <span>{request.estimated_attendance} guests</span>
              </div>
            </div>

            {notice?.short_notice && (
              <ShortNoticePanel requestId={id} notice={notice} />
            )}

            {awaitingFinalReview && (
              <ChangeFlags
                requestId={id}
                changes={changes}
                detailsConfirmedAt={request.details_confirmed_at ?? null}
              />
            )}

            <div className="sec">
              <div className="sec-head">
                <span className="sec-letter">A{'\u2013'}D</span>
                <h3>Requester submission</h3>
              </div>
              <div className="submission">
                <div className="subgroup">
                  <h4>Requester and event</h4>
                  <dl>
                    <Row
                      label="Requester"
                      value={`${request.requester_name} \u00b7 ${request.department_org}`}
                    />
                    <Row label="Email" value={request.contact_email} />
                    <Row label="Phone" value={request.contact_phone} />
                    <Row
                      label="Event type"
                      value={
                        request.event_type_name ??
                        `${request.event_type_other} (not listed)`
                      }
                    />
                    <Row label="Purpose" value={request.event_purpose} />
                  </dl>
                </div>

                <div className="subgroup">
                  <h4>Requirements</h4>
                  <dl>
                    <Row label="Food and beverage" value={request.food_needs} />
                    <Row label="Service" value={request.service_expectations} />
                    <Row label="Dietary" value={request.dietary_restrictions} />
                    <Row label="Room setup" value={request.room_setup} />
                    <Row label="Equipment" value={request.equipment} />
                    <Row label="Technology" value={request.technology} />
                    <Row
                      label="Special requests"
                      value={request.special_requests}
                    />
                  </dl>
                </div>

                <div className="subgroup">
                  <h4>Funding and outside involvement</h4>
                  <dl>
                    <Row
                      label="Budget account"
                      value={request.budget_account || 'None given'}
                    />
                    <Row
                      label="Outside organization"
                      value={
                        request.outside_org_involved
                          ? request.outside_org_name || 'Yes'
                          : 'No'
                      }
                    />
                    <Row
                      label="Outside funding"
                      value={
                        request.outside_funding
                          ? request.outside_funding_detail || 'Yes'
                          : 'No'
                      }
                    />
                    <Row
                      label="Revenue collected"
                      value={
                        request.revenue_collected
                          ? `Yes \u2014 to ${request.revenue_recipient}`
                          : 'No'
                      }
                    />
                    <Row
                      label="Financial risk"
                      value={PARTY[request.financial_risk_bearer ?? '']}
                    />
                  </dl>
                </div>

                <div className="subgroup">
                  <h4>Classification answers</h4>
                  <dl>
                    <Row
                      label="Official College business"
                      value={PARTY[request.official_business]}
                    />
                    <Row
                      label="Owned and controlled by"
                      value={PARTY[request.event_owner]}
                    />
                    <Row
                      label="Primarily benefits"
                      value={PARTY[request.primary_beneficiary]}
                    />
                    <Row
                      label="Primarily pays"
                      value={PARTY[request.primary_payer]}
                    />
                    <Row
                      label="Happens without Central"
                      value={PARTY[request.would_occur_without]}
                    />
                    <Row
                      label="Requester notes"
                      value={request.requester_notes}
                    />
                  </dl>
                </div>
              </div>
            </div>

            {!noticePending && (
              <>
                <FoodSourcePanel
                  requestId={id}
                  sources={foodSources}
                  facility={facility}
                />

                <RequestLayouts requestId={id} isStaff />

                <ReopenDetails
                  requestId={id}
                  lock={lock}
                  history={menuHistory}
                />

                <PaymentPanel
                  requestId={id}
                  payments={payments}
                  config={payConfig}
                />

                <DecisionPanel request={request} messages={messages} />

                {showCapacity && capacityContext && (
                  <CapacityPanel
                    context={capacityContext}
                    sameDay={sameDay}
                    alternatives={altSpaces}
                  />
                )}
              </>
            )}

            {declined && (
              <CatererReferral
                requestId={id}
                existing={referrals}
                caterers={referrableCaterers}
                keepsRoom={roomState?.keeps_room ?? false}
              />
            )}

            <RequestActions
              requestId={id}
              referenceCode={request.reference_code}
              status={request.status}
              isAdmin={user.roles.includes('admin')}
              isClosed={!!lock?.closed_at}
            />
          </div>
        </div>
      </main>
    </>
  );
}
