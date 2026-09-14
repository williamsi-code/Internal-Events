'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Referral, ReferralCaterer } from '@/lib/referrals';

/**
 * Suggesting caterers for an event we cannot take on.
 *
 * Shown on a declined event. The list is ordered by who has had the
 * least work this year, so the same firm does not get everything
 * simply for being alphabetically first.
 */

export default function CatererReferral({
  requestId,
  existing,
  caterers,
  keepsRoom,
}: {
  requestId: string;
  existing: Referral[];
  caterers: ReferralCaterer[];
  keepsRoom: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(existing.length === 0);
  const [picked, setPicked] = useState<string[]>(
    existing.filter((e) => e.caterer_id).map((e) => e.caterer_id!)
  );
  const [other, setOther] = useState(
    existing.find((e) => !e.caterer_id)?.name ?? ''
  );
  const [keeps, setKeeps] = useState(keepsRoom);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );
  }

  async function save() {
    if (picked.length === 0 && !other.trim()) {
      setError('Choose at least one caterer to suggest.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          catererIds: picked,
          catererOther: other.trim() || null,
          keepsRoom: keeps,
          message: message.trim() || null,
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

  if (!editing && existing.length > 0) {
    return (
      <div className="sec">
        <div className="sec-head">
          <h3>Caterers we suggested</h3>
        </div>
        <ul className="referral-list">
          {existing.map((r) => (
            <li key={r.id}>
              <span>
                <span className="referral-name">{r.name}</span>
                {r.speciality && (
                  <span className="referral-meta">{r.speciality}</span>
                )}
                {r.contact_phone && (
                  <span className="referral-meta">{r.contact_phone}</span>
                )}
              </span>
              {r.is_approved ? (
                <span className="pill p-classified">Approved</span>
              ) : (
                <span className="pill p-review">Not on our list</span>
              )}
            </li>
          ))}
        </ul>
        {keepsRoom && (
          <p className="sub">
            The room booking stands, so the event goes ahead with an outside
            caterer.
          </p>
        )}
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            Change the suggestion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Suggest an outside caterer</h3>
      </div>
      <p className="sec-note">
        We cannot take this on, but naming who could is a better answer than a
        refusal. Ordered by who has had the least work this year.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {caterers.length === 0 ? (
        <p className="empty">
          No approved caterers are currently available to suggest.
        </p>
      ) : (
        <div className="referral-picker">
          {caterers.map((c) => (
            <label
              className={`referral-option${
                picked.includes(c.id) ? ' picked' : ''
              }`}
              key={c.id}
            >
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span>
                <span className="referral-name">{c.business_name}</span>
                {c.speciality && (
                  <span className="referral-meta">{c.speciality}</span>
                )}
                <span className="referral-meta">
                  {c.referrals_this_year === 0
                    ? 'No referrals this year'
                    : `${c.referrals_this_year} referral${
                        c.referrals_this_year === 1 ? '' : 's'
                      } this year`}
                  {c.last_referred ? ` \u00b7 last ${c.last_referred}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="field" style={{ marginTop: '1rem' }}>
        <label htmlFor="rf-other">Someone else</label>
        <p className="sub">
          A caterer not on the approved list. They will need approving before
          they can work on campus.
        </p>
        <input
          id="rf-other"
          type="text"
          value={other}
          onChange={(e) => setOther(e.target.value)}
        />
      </div>

      <label className="chk-inline">
        <input
          type="checkbox"
          checked={keeps}
          onChange={(e) => setKeeps(e.target.checked)}
        />
        The room booking still stands
      </label>
      <p className="sub">
        Tick if the event goes ahead in the same room with an outside caterer.
        The booking is kept and the schedule stays accurate.
      </p>

      <div className="field" style={{ marginTop: '1rem' }}>
        <label htmlFor="rf-message">Message to the requester</label>
        <p className="sub">
          Leave blank and we will name the caterers and point them at their
          event page.
        </p>
        <textarea
          id="rf-message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Sending...' : 'Send the suggestion'}
        </button>
        {existing.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
