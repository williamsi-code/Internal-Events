'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Sending a layout to the customer.
 *
 * Sharing posts a message into their thread as well as revealing the
 * diagram, because a layout that appears silently on a page nobody
 * revisits has not really been sent.
 *
 * It is reversible: a layout is a working drawing until someone
 * decides it is ready, and half a floor plan looks finished to a
 * customer.
 */

export default function ShareLayout({
  layoutId,
  requestId,
  layoutName,
  seats,
  sharedAt,
  sharedByName,
}: {
  layoutId: string;
  requestId: string;
  layoutName: string;
  seats: number;
  sharedAt: string | null;
  sharedByName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');

  async function toggle(shared: boolean, withMessage?: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'share',
          layoutId,
          shared,
          message: withMessage ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setComposing(false);
      setMessage('');
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <div className="sec" style={{ marginTop: '1.5rem' }}>
      <div className="sec-head">
        <h3>Sending it to the customer</h3>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {sharedAt ? (
        <>
          <div className="recorded">
            <strong>Sent on {sharedAt}</strong>
            {sharedByName ? ` by ${sharedByName}` : ''}
            <br />
            They have it on their event page and were messaged about it. Changes
            you save from here appear there immediately, so take it back first
            if you are reworking it.
          </div>
          <div className="actions">
            <button
              className="btn btn-ghost"
              onClick={() => toggle(false)}
              disabled={busy}
            >
              Take it back
            </button>
            <Link href={`/staff/${requestId}`} className="edit-link">
              Open the event
            </Link>
          </div>
        </>
      ) : composing ? (
        <>
          <div className="field">
            <label htmlFor="sl-message">Message to the customer</label>
            <p className="sub">
              Leave blank and we will say a layout has been drawn, name it, and
              give the seat count.
            </p>
            <textarea
              id="sl-message"
              rows={4}
              placeholder={`We have drawn a room layout for your event: "${layoutName}", seating ${seats}. It is on your event page. Have a look and tell us if anything needs moving.`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => toggle(true, message || undefined)}
              disabled={busy}
            >
              {busy ? 'Sending...' : 'Send it'}
            </button>
            <button className="btn btn-ghost" onClick={() => setComposing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sec-note">
            Not sent yet. The customer cannot see this layout until you send it,
            so it is safe to leave half-finished. Sending puts it on their event
            page and messages them about it.
          </p>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => setComposing(true)}
              disabled={busy}
            >
              Send to the customer
            </button>
            <Link href={`/staff/${requestId}`} className="edit-link">
              Open the event
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
