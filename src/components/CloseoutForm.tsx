'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { classificationLabel, type Classification } from '@/lib/classify';
import type { CloseoutState } from '@/lib/closeout';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function CloseoutForm({ state }: { state: CloseoutState }) {
  const router = useRouter();

  const [didNotOccur, setDidNotOccur] = useState(state.did_not_occur);
  const [attendance, setAttendance] = useState(
    String(
      state.actual_attendance ??
        state.final_attendance ??
        state.estimated_attendance
    )
  );

  // Food starts from what the order would have cost at the internal
  // tier, which is defined as food and disposables at cost.
  const [food, setFood] = useState(
    state.food_cost ?? state.suggested_food_cost ?? '0'
  );
  const [consumables, setConsumables] = useState(state.consumables_cost ?? '0');
  const [labor, setLabor] = useState(state.labor_cost ?? '0');
  const [other, setOther] = useState(state.other_cost ?? '0');
  const [hours, setHours] = useState(state.labor_hours ?? '');
  const [notes, setNotes] = useState(state.closeout_notes ?? '');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);

  const closed = !!state.closed_at && !reopening;

  const trueCost =
    Number(food || 0) +
    Number(consumables || 0) +
    Number(labor || 0) +
    Number(other || 0);
  const charged = Number(state.charged ?? state.quoted_total ?? 0);
  const gap = charged - trueCost;

  const isInternal = state.classification === 'internal';
  const isExternal = state.classification === 'external';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/closeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: state.id,
          didNotOccur,
          actualAttendance: didNotOccur ? null : Number(attendance) || 0,
          costs: {
            food: Number(food) || 0,
            consumables: Number(consumables) || 0,
            labor: Number(labor) || 0,
            other_direct: Number(other) || 0,
          },
          laborHours: hours ? Number(hours) : null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not close this out.');
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

  if (closed) {
    return (
      <div className="card">
        <span className="eyebrow">Closed</span>
        <h2>{state.event_name}</h2>
        <p className="hint">
          Closed out by {state.closed_by_name} on {state.closed_at}.
        </p>

        <div className="closeout-summary">
          <div>
            <span className="cap-l">Attendance</span>
            <span className="cap-n">{state.actual_attendance ?? '\u2014'}</span>
          </div>
          <div>
            <span className="cap-l">True cost</span>
            <span className="cap-n">{money(trueCost)}</span>
          </div>
          <div>
            <span className="cap-l">Charged</span>
            <span className="cap-n">{money(charged)}</span>
          </div>
          <div className={gap < 0 ? 'neg' : 'pos'}>
            <span className="cap-l">
              {isExternal ? 'Contribution' : 'College support'}
            </span>
            <span className="cap-n">{money(Math.abs(gap))}</span>
          </div>
        </div>

        {state.closeout_notes && (
          <p className="info-p" style={{ marginTop: '1rem' }}>
            {state.closeout_notes}
          </p>
        )}

        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setReopening(true)}>
            Correct these figures
          </button>
          <Link href={`/staff/${state.id}`} className="edit-link">
            Open the request
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="eyebrow">Close out</span>
      <h2>{state.event_name}</h2>
      <p className="hint">
        {state.event_date_long} {'\u00b7'} {state.space_name} {'\u00b7'}{' '}
        {state.department_org}
        {state.classification
          ? ` \u00b7 ${classificationLabel(state.classification as Classification)}`
          : ''}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <label className="chk-inline" style={{ marginBottom: '1.2rem' }}>
        <input
          type="checkbox"
          checked={didNotOccur}
          onChange={(e) => setDidNotOccur(e.target.checked)}
        />
        This event did not take place
      </label>

      {!didNotOccur && (
        <>
          <div className="field">
            <label htmlFor="co-attendance">How many people actually came?</label>
            <p className="sub">
              Expected {state.final_attendance ?? state.estimated_attendance}.
              The difference between what was guaranteed and who arrived is
              worth knowing over time.
            </p>
            <input
              id="co-attendance"
              type="number"
              min={0}
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
              style={{ maxWidth: '10rem' }}
            />
          </div>

          <h4 className="admin-h4">What it actually cost</h4>
          <div className="cost-grid">
            <div className="field">
              <label htmlFor="co-food">Food</label>
              <p className="sub">
                Suggested {money(Number(state.suggested_food_cost))} from the
                order.
              </p>
              <input
                id="co-food"
                type="number"
                min={0}
                step="0.01"
                value={food}
                onChange={(e) => setFood(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="co-consumables">Consumables</label>
              <p className="sub">Disposables, linens, service ware.</p>
              <input
                id="co-consumables"
                type="number"
                min={0}
                step="0.01"
                value={consumables}
                onChange={(e) => setConsumables(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="co-labor">Labor</label>
              <p className="sub">Setup, service, and teardown.</p>
              <input
                id="co-labor"
                type="number"
                min={0}
                step="0.01"
                value={labor}
                onChange={(e) => setLabor(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="co-other">Other direct</label>
              <p className="sub">Rentals, contracted services.</p>
              <input
                id="co-other"
                type="number"
                min={0}
                step="0.01"
                value={other}
                onChange={(e) => setOther(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="co-hours">Labor hours</label>
            <p className="sub">
              Total across everyone. Section F of the quarterly report needs
              hours, not only dollars.
            </p>
            <input
              id="co-hours"
              type="number"
              min={0}
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              style={{ maxWidth: '10rem' }}
            />
          </div>

          <div className="closeout-summary live">
            <div>
              <span className="cap-l">True cost</span>
              <span className="cap-n">{money(trueCost)}</span>
            </div>
            <div>
              <span className="cap-l">Charged</span>
              <span className="cap-n">{money(charged)}</span>
            </div>
            <div className={gap < 0 ? 'neg' : 'pos'}>
              <span className="cap-l">
                {isExternal
                  ? 'Contribution'
                  : isInternal
                    ? 'Institutional support'
                    : 'Partnership support'}
              </span>
              <span className="cap-n">{money(Math.abs(gap))}</span>
            </div>
          </div>

          {gap < 0 && isExternal && (
            <div className="callout c-flag">
              <strong>This external event cost more than it earned</strong>
              Worth a note below on why, while it is still fresh.
            </div>
          )}
        </>
      )}

      <div className="field" style={{ marginTop: '1.2rem' }}>
        <label htmlFor="co-notes">Notes</label>
        <p className="sub">
          What went well, what did not, anything the next person planning a
          similar event should know.
        </p>
        <textarea
          id="co-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Closing...' : 'Close out this event'}
        </button>
        {reopening && (
          <button className="btn btn-ghost" onClick={() => setReopening(false)}>
            Cancel
          </button>
        )}
        <Link href={`/staff/${state.id}`} className="edit-link">
          Open the request
        </Link>
      </div>
    </div>
  );
}
