'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Change } from '@/lib/changes';

export default function ChangeFlags({
  requestId,
  changes,
  detailsConfirmedAt,
}: {
  requestId: string;
  changes: Change[];
  detailsConfirmedAt: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const material = changes.filter((c) => c.material);

  async function act(action: 'confirm' | 'reclassify') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/final-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, note: note || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not record that.');
        setBusy(false);
        return;
      }
      setNote('');
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-letter">FINAL</span>
        <h3>Final review</h3>
      </div>
      <p className="sec-note">
        The requester confirmed their details on {detailsConfirmedAt}. Check that
        the classification still applies, then confirm the event.
      </p>

      {material.length > 0 ? (
        <div className="callout c-flag">
          <strong>
            {material.length} change{material.length === 1 ? '' : 's'} since
            classification
          </strong>
          These could affect which classification applies.
        </div>
      ) : changes.length > 0 ? (
        <div className="callout c-default">
          <strong>Nothing material has changed</strong>
          Some details differ from when this was classified, but none of them
          affect the classification.
        </div>
      ) : (
        <div className="callout c-default">
          <strong>Nothing has changed since classification</strong>
          The event is the same as when it was classified.
        </div>
      )}

      {changes.length > 0 && (
        <ul className="changes">
          {changes.map((c) => (
            <li key={c.field} className={c.material ? 'material' : ''}>
              <span className="change-label">{c.label}</span>
              <span className="change-values">
                <span className="was">{c.before}</span>
                {' \u2192 '}
                <span className="now">{c.after}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <label className="lbl" htmlFor="review-note">
        Note to the requester
      </label>
      <p className="sub">Optional. Sent with your decision.</p>
      <textarea
        id="review-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={() => act('confirm')}
          disabled={busy}
        >
          {busy ? 'Working...' : 'Classification still applies - confirm event'}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => act('reclassify')}
          disabled={busy}
        >
          Send back for reclassification
        </button>
      </div>
    </div>
  );
}
