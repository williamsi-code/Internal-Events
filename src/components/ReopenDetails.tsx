'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DetailsLockState, MenuVersion } from '@/lib/reopen';

const money = (v: string) =>
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function ReopenDetails({
  requestId,
  lock,
  history,
}: {
  requestId: string;
  lock: DetailsLockState | null;
  history: MenuVersion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!lock) return null;

  const confirmed = !!lock.details_confirmed_at;
  const closed = !!lock.closed_at;
  const reopened = !!lock.details_reopened_at && !confirmed;
  const late = lock.days_out <= 10 && lock.days_out >= 0;

  async function reopen() {
    if (!reason.trim()) {
      setError('Say why the details are being reopened.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/reopen-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          reason,
          message: message || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not reopen.');
        setBusy(false);
        return;
      }
      setOpen(false);
      setReason('');
      setMessage('');
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
        <h3>Menu and setup</h3>
      </div>

      {closed ? (
        <div className="callout c-default">
          <strong>Closed out on {lock.closed_at}</strong>
          The figures for this event are final.
        </div>
      ) : confirmed ? (
        <>
          <div className="recorded">
            <strong>
              Confirmed by the requester on {lock.details_confirmed_at}
            </strong>
            <br />
            Order totals {money(lock.menu_total)}
            {lock.details_reopen_count > 0 && (
              <>
                <br />
                Changed {lock.details_reopen_count} time
                {lock.details_reopen_count === 1 ? '' : 's'} since first
                confirmed
              </>
            )}
          </div>

          {!open ? (
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setOpen(true)}>
                Reopen for changes
              </button>
              {history.length > 0 && (
                <button
                  className="edit-link"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  {showHistory ? 'Hide' : 'Show'} previous versions (
                  {history.length})
                </button>
              )}
            </div>
          ) : (
            <>
              {late && (
                <div className="callout c-flag">
                  <strong>
                    {lock.days_out === 0
                      ? 'This event is today'
                      : `This event is ${lock.days_out} day${
                          lock.days_out === 1 ? '' : 's'
                        } away`}
                  </strong>
                  The kitchen may already have ordered against the current
                  figures. Worth a conversation before reopening.
                  {lock.headcount_submitted_at &&
                    ` The final headcount came in on ${lock.headcount_submitted_at}.`}
                </div>
              )}

              {error && <div className="alert alert-error">{error}</div>}

              <div className="field">
                <label htmlFor="ro-reason">Why is this being reopened?</label>
                <p className="sub">
                  Kept on the record. The current order is snapshotted before
                  anything changes.
                </p>
                <input
                  id="ro-reason"
                  type="text"
                  value={reason}
                  placeholder="Requester asked to add a dessert course"
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="ro-message">Message to the requester</label>
                <p className="sub">
                  Leave blank and we will tell them their details are open for
                  changes.
                </p>
                <textarea
                  id="ro-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div className="actions">
                <button
                  className="btn btn-primary"
                  onClick={reopen}
                  disabled={busy}
                >
                  {busy ? 'Reopening...' : 'Reopen details'}
                </button>
                <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                  Never mind
                </button>
              </div>
            </>
          )}
        </>
      ) : reopened ? (
        <div className="callout c-warn">
          <strong>Reopened on {lock.details_reopened_at}</strong>
          {lock.details_reopened_by ? `By ${lock.details_reopened_by}. ` : ''}
          Waiting for the requester to confirm again. It will come back for
          final review once they do.
        </div>
      ) : (
        <p className="sec-note">
          The requester has not confirmed their menu and setup yet.
        </p>
      )}

      {showHistory && history.length > 0 && (
        <div className="version-history">
          <h4 className="admin-h4">Previous versions</h4>
          {history.map((v, i) => (
            <div className="version" key={i}>
              <div className="version-head">
                <span>
                  <strong>{money(v.total)}</strong> {'\u00b7'} {v.captured_at}
                </span>
                <span className="sub">
                  {v.captured_reason}
                  {v.captured_by_name ? ` \u2014 ${v.captured_by_name}` : ''}
                </span>
              </div>
              {Array.isArray(v.items) && v.items.length > 0 ? (
                <ul className="version-items">
                  {v.items.map((it, j) => (
                    <li key={j}>
                      <span>
                        {it.item}
                        <span className="estimate-qty">
                          {' \u00d7'}
                          {it.quantity}
                        </span>
                      </span>
                      <span>
                        {money(String(Number(it.unit_price) * it.quantity))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">Nothing was selected at that point.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
