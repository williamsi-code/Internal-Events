'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShortNoticeState } from '@/lib/notice';

/**
 * The first decision on a short-notice request.
 *
 * Deliberately at the top of the page and hard to miss: everything
 * else waits on it, and the date is hours away.
 */

export default function ShortNoticePanel({
  requestId,
  notice,
}: {
  requestId: string;
  notice: ShortNoticeState;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!notice.short_notice) return null;

  async function decide(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/short-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          approve,
          note: note.trim() || null,
        }),
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

  const hours = Number(notice.hours_away ?? 0);

  if (notice.state && notice.state !== 'pending') {
    return (
      <div className={`sec short-notice ${notice.state}`}>
        <div className="sec-head">
          <h3>Short notice</h3>
        </div>
        <div className="recorded">
          <strong>
            {notice.state === 'approved'
              ? 'Approved to proceed at short notice'
              : 'Not approved'}
          </strong>
          {notice.note ? (
            <>
              <br />
              {notice.note}
            </>
          ) : null}
          <span className="when">
            {notice.decided_by_name} {'\u00b7'} {notice.decided_at}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="sec short-notice pending">
      <div className="sec-head">
        <span className="sec-letter">!</span>
        <h3>Short notice &mdash; decide this first</h3>
      </div>

      <div className="callout c-flag">
        <strong>
          {hours < 0
            ? 'This event has already started'
            : hours < 24
              ? `This event is ${Math.round(hours)} hours away`
              : `This event is ${Math.round(hours / 24)} day${
                  Math.round(hours / 24) === 1 ? '' : 's'
                } away`}
        </strong>
        The room normally needs {notice.required_hours} hours&rsquo; notice.
        Nothing else happens on this request until someone says whether we can
        take it on.
      </div>

      {notice.reason && (
        <div className="field">
          <label>Why they say it is late</label>
          <p className="short-notice-reason">{notice.reason}</p>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="field">
        <label htmlFor="sn-note">Message to the requester</label>
        <p className="sub">
          Leave blank and we will say whether it can go ahead, in plain terms.
        </p>
        <textarea
          id="sn-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={() => decide(true)}
          disabled={busy}
        >
          {busy ? 'Saving...' : 'We can do it'}
        </button>
        <button
          className="btn btn-ghost danger"
          onClick={() => decide(false)}
          disabled={busy}
        >
          Not at this notice
        </button>
      </div>

      <p className="sub" style={{ marginTop: '.6rem' }}>
        Approving does not commit to the event. It lets the request be
        classified and checked like any other.
      </p>
    </div>
  );
}
