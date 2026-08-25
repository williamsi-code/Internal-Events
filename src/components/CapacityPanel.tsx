'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  CapacityContext,
  SameDayBooking,
  AltSpace,
} from '@/lib/capacity';

const CHECKS: [keyof Checks, string, string][] = [
  ['staffing', 'Staffing available', 'Enough people to run it'],
  ['kitchen', 'Kitchen capacity', 'Production fits alongside the day'],
  ['facility', 'Facility available', 'Room is free and suitable'],
  ['equipment', 'Equipment available', 'Tables, linens, service ware'],
  ['noConflict', 'No major conflict', 'Nothing else competing'],
  ['revenueReviewed', 'Revenue impact reviewed', 'Worth the capacity it uses'],
];

const REASONS: [string, string][] = [
  ['staffing_capacity', 'Not enough staff'],
  ['kitchen_capacity', 'Kitchen at capacity'],
  ['facility_unavailable', 'Facility unavailable'],
  ['equipment_unavailable', 'Equipment unavailable'],
  ['date_conflict', 'Date conflict'],
  ['policy_or_risk', 'Policy or risk'],
  ['other', 'Other'],
];

interface Checks {
  staffing: boolean;
  kitchen: boolean;
  facility: boolean;
  equipment: boolean;
  noConflict: boolean;
  revenueReviewed: boolean;
}

export default function CapacityPanel({
  context,
  sameDay,
  alternatives,
}: {
  context: CapacityContext;
  sameDay: SameDayBooking[];
  alternatives: AltSpace[];
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<
    'proceed' | 'alternative_offered' | 'declined' | ''
  >('');
  const [checks, setChecks] = useState<Checks>({
    staffing: false,
    kitchen: false,
    facility: context.space_conflicts === 0,
    equipment: false,
    noConflict: context.space_conflicts === 0,
    revenueReviewed: false,
  });
  const [concerns, setConcerns] = useState('');
  const [proposedDate, setProposedDate] = useState('');
  const [proposedSpaceId, setProposedSpaceId] = useState('');
  const [proposedDetail, setProposedDetail] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [revenueLost, setRevenueLost] = useState('');
  const [catererReferred, setCatererReferred] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);

  const done = !!context.existing_outcome && !reopening;

  const cap = context.capacity_standing ?? context.capacity_seated;
  const overCapacity = cap !== null && context.attendance > cap;
  const tight =
    cap !== null && !overCapacity && context.attendance > cap * 0.85;

  async function submit() {
    if (!outcome) {
      setError('Choose an outcome.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: context.request_id,
          outcome,
          checks,
          concerns: concerns || null,
          proposedDate: proposedDate || null,
          proposedSpaceId: proposedSpaceId || null,
          proposedDetail: proposedDetail || null,
          declineReason: declineReason || null,
          estimatedRevenueLost: revenueLost ? Number(revenueLost) : null,
          outsideCatererReferred: catererReferred,
          message: message || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not record the check.');
        setBusy(false);
        return;
      }
      setReopening(false);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const OUTCOME_LABEL: Record<string, string> = {
    proceed: 'Proceed',
    alternative_offered: 'Alternative offered',
    declined: 'Declined',
  };

  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-letter">G</span>
        <h3>Operational capacity</h3>
      </div>

      {done ? (
        <>
          <div className="recorded">
            <strong>{OUTCOME_LABEL[context.existing_outcome!]}</strong>
            <span className="when">
              {context.checked_by_name} {'\u00b7'} {context.checked_at}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={() => setReopening(true)}>
            Check again
          </button>
        </>
      ) : (
        <>
          {/* What the system already knows, so the judgement is made
              against facts rather than memory. */}
          <div className="cap-facts">
            <div className={`cap-fact${overCapacity ? ' bad' : tight ? ' warn' : ''}`}>
              <span className="cap-n">{context.attendance}</span>
              <span className="cap-l">
                guests
                {cap !== null ? ` of ${cap} capacity` : ''}
              </span>
            </div>
            <div className={`cap-fact${context.space_conflicts > 0 ? ' bad' : ''}`}>
              <span className="cap-n">{context.space_conflicts}</span>
              <span className="cap-l">other bookings in this space</span>
            </div>
            <div className={`cap-fact${context.events_that_day >= 3 ? ' warn' : ''}`}>
              <span className="cap-n">{context.events_that_day}</span>
              <span className="cap-l">events that day</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{context.guests_that_day}</span>
              <span className="cap-l">guests across the day</span>
            </div>
          </div>

          {overCapacity && (
            <div className="callout c-flag">
              <strong>Over the room&rsquo;s capacity</strong>
              {context.space_name} holds {cap}. This event expects{' '}
              {context.attendance}.
            </div>
          )}
          {context.supports_catering === false && (
            <div className="callout c-flag">
              <strong>Catering is not permitted in this space</strong>
              {context.space_name} is marked as no food or drink.
            </div>
          )}

          {sameDay.length > 0 && (
            <details className="cap-sameday">
              <summary>
                {sameDay.length} other booking
                {sameDay.length === 1 ? '' : 's'} on {context.event_date_long}
              </summary>
              <ul>
                {sameDay.map((s, i) => (
                  <li key={i}>
                    <span>
                      <strong>{s.title}</strong>
                      <br />
                      <span className="sub">
                        {s.space_name} {'\u00b7'} {s.window}
                        {s.attendance ? ` \u00b7 ${s.attendance} guests` : ''}
                      </span>
                    </span>
                    <span className={`pill p-${s.status}`}>{s.status}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <h4 className="admin-h4">Confirm what is available</h4>
          <div className="checks">
            {CHECKS.map(([key, label, hint]) => (
              <label className="chk" key={key}>
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={(e) =>
                    setChecks({ ...checks, [key]: e.target.checked })
                  }
                />
                <span>
                  {label}
                  <span className="chk-hint">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          <h4 className="admin-h4">Outcome</h4>
          <div className="choices" role="radiogroup" aria-label="Outcome">
            {(
              [
                ['proceed', 'Proceed'],
                ['alternative_offered', 'Offer an alternative'],
                ['declined', 'Cannot accommodate'],
              ] as const
            ).map(([v, label]) => (
              <label className="choice" key={v}>
                <input
                  type="radio"
                  name="outcome"
                  value={v}
                  checked={outcome === v}
                  onChange={() => setOutcome(v)}
                />
                {label}
              </label>
            ))}
          </div>

          {outcome === 'alternative_offered' && (
            <div className="cap-branch">
              <div className="grid two">
                <div className="field">
                  <label htmlFor="alt-date">Alternative date</label>
                  <input
                    id="alt-date"
                    type="date"
                    value={proposedDate}
                    onChange={(e) => setProposedDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="alt-space">Alternative space</label>
                  <select
                    id="alt-space"
                    value={proposedSpaceId}
                    onChange={(e) => setProposedSpaceId(e.target.value)}
                  >
                    <option value="">No change</option>
                    {alternatives.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                        {s.capacity_seated ? ` (${s.capacity_seated})` : ''}
                        {s.free ? '' : ' \u2014 also booked'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="alt-detail">What are you offering?</label>
                <p className="sub">
                  Shown to the requester. Be specific about what changes.
                </p>
                <textarea
                  id="alt-detail"
                  value={proposedDetail}
                  onChange={(e) => setProposedDetail(e.target.value)}
                />
              </div>
            </div>
          )}

          {outcome === 'declined' && (
            <div className="cap-branch">
              <div className="field">
                <label htmlFor="dec-reason">Reason</label>
                <select
                  id="dec-reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                >
                  <option value="">Choose a reason</option>
                  {REASONS.map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid two">
                <div className="field">
                  <label htmlFor="dec-revenue">Estimated revenue lost</label>
                  <p className="sub">
                    What we would have billed. Without it, the quarterly report
                    counts the event but cannot weigh it.
                  </p>
                  <input
                    id="dec-revenue"
                    type="number"
                    min={0}
                    step="0.01"
                    value={revenueLost}
                    onChange={(e) => setRevenueLost(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="chk-inline">
                    <input
                      type="checkbox"
                      checked={catererReferred}
                      onChange={(e) => setCatererReferred(e.target.checked)}
                    />
                    Referred to an outside caterer
                  </label>
                  <p className="sub">
                    Tracked separately: work we sent away for want of capacity.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: '1rem' }}>
            <label htmlFor="cap-concerns">Concerns and notes</label>
            <p className="sub">Internal. Not shown to the requester.</p>
            <textarea
              id="cap-concerns"
              value={concerns}
              onChange={(e) => setConcerns(e.target.value)}
            />
          </div>

          {outcome !== 'proceed' && outcome !== '' && (
            <div className="field">
              <label htmlFor="cap-message">Message to the requester</label>
              <textarea
                id="cap-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <div className="actions">
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Recording...' : 'Record capacity check'}
            </button>
            {reopening && (
              <button
                className="btn btn-ghost"
                onClick={() => setReopening(false)}
              >
                Cancel
              </button>
            )}
            <Link href="/staff/schedule" className="edit-link">
              Open the schedule
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
