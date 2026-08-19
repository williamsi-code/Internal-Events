import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import DecisionPanel from '@/components/DecisionPanel';
import { getSessionUser } from '@/lib/auth';
import { getRequest, getMessages } from '@/lib/requests';

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
                    <Row label="Special requests" value={request.special_requests} />
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
                    <Row label="Primarily pays" value={PARTY[request.primary_payer]} />
                    <Row
                      label="Happens without Central"
                      value={PARTY[request.would_occur_without]}
                    />
                    <Row label="Requester notes" value={request.requester_notes} />
                  </dl>
                </div>
              </div>
            </div>

            <DecisionPanel request={request} messages={messages} />
          </div>
        </div>
      </main>
    </>
  );
}