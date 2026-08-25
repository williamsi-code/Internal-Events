'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MyRequestDetail } from '@/lib/requests';

export default function HeadcountForm({
  request,
}: {
  request: MyRequestDetail;
}) {
  const router = useRouter();
  const [count, setCount] = useState(
    request.final_attendance ? String(request.final_attendance) : ''
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitted = !!request.headcount_submitted_at;
  const days = request.days_to_headcount;
  const overdue = days !== null && days < 0 && !submitted;
  const dueSoon = days !== null && days >= 0 && days <= 5 && !submitted;

  async function submit() {
    const n = Number(count);
    if (!n || n < 1) {
      setError('Enter a guest count of at least one.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/requests/headcount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, finalAttendance: n }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save that.');
        setBusy(false);
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Final guest count</h3>
      </div>

      {submitted ? (
        <>
          <div className="callout c-default">
            <strong>
              {request.final_attendance} guests confirmed on{' '}
              {request.headcount_submitted_at}
            </strong>
            This is the number the kitchen will produce for and the number you
            will be charged for.
          </div>
          <p className="sub">
            If your numbers change, send the events office a message below
            rather than editing this.
          </p>
        </>
      ) : (
        <>
          {overdue ? (
            <div className="callout c-flag">
              <strong>
                Your final count was due {request.headcount_due_on}
              </strong>
              The kitchen orders against this number. Please send it as soon as
              you can.
            </div>
          ) : dueSoon ? (
            <div className="callout c-warn">
              <strong>
                Final count due {request.headcount_due_on}
                {days === 0 ? ' — today' : ` — ${days} day${days === 1 ? '' : 's'} left`}
              </strong>
              Ten days before your event we need a firm number so the kitchen
              can order.
            </div>
          ) : (
            <div className="callout c-default">
              <strong>Final count due {request.headcount_due_on}</strong>
              You can send it any time before then. We are working to your
              estimate of {request.estimated_attendance} until you do.
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <div className="headcount-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="finalCount">How many guests are coming?</label>
              <input
                id="finalCount"
                type="number"
                min={1}
                value={count}
                placeholder={String(request.estimated_attendance)}
                onChange={(e) => {
                  setCount(e.target.value);
                  setError('');
                }}
              />
            </div>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Sending...' : 'Confirm count'}
            </button>
          </div>

          <p className="sub" style={{ marginTop: '.7rem' }}>
            Give your best firm number rather than a generous one. Charges are
            based on this figure, not on how many people actually arrive.
          </p>
        </>
      )}
    </div>
  );
}
