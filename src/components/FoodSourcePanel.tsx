'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RequestFoodSource, FacilityChargeState } from '@/lib/food-sources';
import { FOOD_SOURCE_LABEL } from '@/lib/food-labels';

export default function FoodSourcePanel({
  requestId,
  sources,
  facility,
}: {
  requestId: string;
  sources: RequestFoodSource[];
  facility: FacilityChargeState | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(
    facility?.applied ?? facility?.suggested ?? '0'
  );
  const [note, setNote] = useState(facility?.note ?? '');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const money = (v: string | null) =>
    v === null
      ? '\u2014'
      : Number(v).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        });

  const decided = facility?.applied !== null && !editing;
  const needsDecision = facility?.is_split && facility?.applied === null;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/facility-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          amount: Number(amount) || 0,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setEditing(false);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const hasOutside = sources.some(
    (s) => s.kind === 'outside_caterer' || s.kind === 'donated'
  );

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Food and facility</h3>
      </div>

      <ul className="source-list">
        {sources.map((s) => (
          <li key={s.id}>
            <span>
              <span className="source-name">
                {FOOD_SOURCE_LABEL[s.kind]}
                {s.caterer_name ? ` \u2014 ${s.caterer_name}` : ''}
                {!s.caterer_name && s.caterer_other
                  ? ` \u2014 ${s.caterer_other}`
                  : ''}
              </span>
              {s.covers && (
                <span className="source-covers">Covering: {s.covers}</span>
              )}
              {s.policy_acknowledged_at && (
                <span className="source-covers">
                  Policy acknowledged {s.policy_acknowledged_at}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {s.caterer_id && s.caterer_status === 'approved' && (
                <span className="pill p-classified">Approved</span>
              )}
              {s.insurance_lapsed && (
                <span className="pill p-flag">Insurance lapsed</span>
              )}
              {s.kind === 'outside_caterer' && !s.caterer_id && (
                <span className="pill p-review">Not an approved caterer</span>
              )}
              {s.kind === 'donated' && (
                <span className="pill p-review">Food safety</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {hasOutside && facility && (
        <>
          {needsDecision && (
            <div className="callout c-warn" style={{ marginTop: '1.1rem' }}>
              <strong>Split catering &mdash; facility charge needs deciding</strong>
              Central is being paid for its portion. Whether the room is also
              charged is a judgement for this event. The suggestion below is
              half the tier rate, which is a starting point rather than a rule.
            </div>
          )}

          {decided ? (
            <div className="recorded" style={{ marginTop: '1.1rem' }}>
              <strong>Facility charge {money(facility.applied)}</strong>
              {facility.note ? (
                <>
                  <br />
                  {facility.note}
                </>
              ) : null}
              <span className="when">
                {facility.set_by_name} {'\u00b7'} {facility.set_at}
              </span>
            </div>
          ) : (
            <>
              <div className="cap-facts" style={{ marginTop: '1.1rem' }}>
                <div className="cap-fact">
                  <span className="cap-n">{money(facility.suggested)}</span>
                  <span className="cap-l">
                    suggested {facility.rate_basis ?? 'per event'}
                  </span>
                </div>
                <div className="cap-fact">
                  <span className="cap-n">
                    {facility.has_central ? 'Yes' : 'No'}
                  </span>
                  <span className="cap-l">Central providing food</span>
                </div>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div className="grid two">
                <div className="field">
                  <label htmlFor="fc-amount">Facility charge to apply</label>
                  <input
                    id="fc-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fc-note">Why this amount</label>
                  <p className="sub">Shown to the requester with the charge.</p>
                  <input
                    id="fc-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="actions">
                <button
                  className="btn btn-primary"
                  onClick={save}
                  disabled={busy}
                >
                  {busy ? 'Saving...' : 'Set facility charge'}
                </button>
                {editing && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}

          {decided && (
            <button
              className="btn btn-ghost"
              onClick={() => setEditing(true)}
              style={{ marginTop: '.5rem' }}
            >
              Change it
            </button>
          )}
        </>
      )}
    </div>
  );
}
