'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Sending a layout to the customer.
 *
 * Sharing is explicit and reversible. A layout is a working drawing
 * until someone decides it is ready, which matters because half a
 * floor plan looks like a finished one to a customer.
 */

export default function ShareLayout({
  layoutId,
  requestId,
  sharedAt,
  sharedByName,
}: {
  layoutId: string;
  requestId: string;
  sharedAt: string | null;
  sharedByName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle(shared: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share', layoutId, shared }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
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
            <strong>Shared on {sharedAt}</strong>
            {sharedByName ? ` by ${sharedByName}` : ''}
            <br />
            They can see it on their own page. Any changes you save appear
            there immediately, so take it back first if you are reworking it.
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
      ) : (
        <>
          <p className="sec-note">
            Not shared yet. The customer cannot see this layout until you send
            it, so it is safe to leave half-finished.
          </p>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => toggle(true)}
              disabled={busy}
            >
              {busy ? 'Sharing...' : 'Share with the customer'}
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
