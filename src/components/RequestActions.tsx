'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const REASONS: [string, string][] = [
  ['requester_withdrew', 'Requester withdrew'],
  ['date_changed', 'Date changed - resubmitting'],
  ['duplicate_request', 'Duplicate of another request'],
  ['no_longer_needed', 'No longer needed'],
  ['funding_withdrawn', 'Funding withdrawn'],
  ['weather', 'Weather'],
  ['other', 'Other'],
];

export default function RequestActions({
  requestId,
  referenceCode,
  status,
  isAdmin,
  isClosed,
}: {
  requestId: string;
  referenceCode: string;
  status: string;
  isAdmin: boolean;
  isClosed: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'' | 'cancel' | 'delete'>('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const alreadyGone = ['cancelled', 'denied'].includes(status);

  async function send(body: Record<string, unknown>, redirectAfter = false) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/request-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not do that.');
        setBusy(false);
        return;
      }
      if (redirectAfter) {
        router.push('/staff');
        router.refresh();
        return;
      }
      setMode('');
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <div className="sec danger-sec">
      <div className="sec-head">
        <h3>Cancel or remove</h3>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {mode === '' && (
        <>
          <p className="sec-note">
            Cancelling keeps the record and frees the room. Deleting removes the
            request entirely and is only for things that should never have been
            here.
          </p>
          <div className="actions">
            {!alreadyGone && !isClosed && (
              <button className="btn btn-ghost" onClick={() => setMode('cancel')}>
                Cancel this event
              </button>
            )}
            {isAdmin && (
              <button
                className="btn btn-ghost danger"
                onClick={() => setMode('delete')}
              >
                Delete permanently
              </button>
            )}
            {alreadyGone && (
              <span className="sub">
                This request is already {status}.
              </span>
            )}
          </div>
        </>
      )}

      {mode === 'cancel' && (
        <>
          <div className="field">
            <label htmlFor="cx-reason">Why is it being cancelled?</label>
            <p className="sub">
              An external event withdrawing is recorded as lost business.
            </p>
            <select
              id="cx-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Choose a reason</option>
              {REASONS.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="cx-note">Internal note</label>
            <textarea
              id="cx-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="cx-message">Message to the requester</label>
            <p className="sub">Optional. Leave blank to cancel quietly.</p>
            <textarea
              id="cx-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy || !reason}
              onClick={() =>
                send({
                  action: 'cancel',
                  requestId,
                  reason,
                  note: note || null,
                  message: message || null,
                })
              }
            >
              {busy ? 'Cancelling...' : 'Cancel this event'}
            </button>
            <button className="btn btn-ghost" onClick={() => setMode('')}>
              Never mind
            </button>
          </div>
        </>
      )}

      {mode === 'delete' && (
        <>
          <div className="callout c-flag">
            <strong>This cannot be undone</strong>
            The request, its classification, messages, menu selections, and
            booking all go. Only do this for test data, duplicates, or something
            submitted in error. For a real event that is not happening, cancel
            it instead.
          </div>

          <div className="field">
            <label htmlFor="dl-reason">Why are you deleting it?</label>
            <p className="sub">Recorded even though the request is not.</p>
            <input
              id="dl-reason"
              type="text"
              value={deleteReason}
              placeholder="Test data from setup"
              onChange={(e) => setDeleteReason(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="dl-confirm">
              Type <code>{referenceCode}</code> to confirm
            </label>
            <input
              id="dl-confirm"
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="actions">
            <button
              className="btn btn-danger"
              disabled={
                busy ||
                !deleteReason.trim() ||
                confirmCode.trim().toUpperCase() !== referenceCode.toUpperCase()
              }
              onClick={() =>
                send(
                  {
                    action: 'delete',
                    requestId,
                    confirmCode,
                    reason: deleteReason,
                  },
                  true
                )
              }
            >
              {busy ? 'Deleting...' : 'Delete permanently'}
            </button>
            <button className="btn btn-ghost" onClick={() => setMode('')}>
              Never mind
            </button>
          </div>
        </>
      )}
    </div>
  );
}
