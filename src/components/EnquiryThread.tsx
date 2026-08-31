'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EnquiryMessage } from '@/lib/enquiries';

export default function EnquiryThread({
  enquiryId,
  messages,
  isStaff,
  status,
}: {
  enquiryId: string;
  messages: EnquiryMessage[];
  isStaff: boolean;
  status: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const closed = ['closed', 'converted'].includes(status);

  async function send(isInternal: boolean, close = false) {
    if (!body.trim()) {
      setError('Write something first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/enquiry/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiryId, body, isInternal, close }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not send.');
        setBusy(false);
        return;
      }
      setBody('');
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <>
      <ul className="thread">
        {messages.map((m) => (
          <li
            key={m.id}
            className={
              m.is_internal ? 'internal' : m.is_staff ? 'outbound' : ''
            }
          >
            <div className="who">
              {m.is_internal
                ? `${m.author_name} \u00b7 internal note`
                : m.is_staff
                  ? 'Events & Conferences'
                  : isStaff
                    ? m.author_name
                    : 'You'}
              {' \u00b7 '}
              {m.created_at}
            </div>
            {m.body}
          </li>
        ))}
      </ul>

      {error && <div className="alert alert-error">{error}</div>}

      {closed ? (
        <p className="sub">
          This enquiry is {status}. Start a new one if something else comes up.
        </p>
      ) : (
        <>
          <label className="lbl" htmlFor="reply">
            {isStaff ? 'Reply' : 'Add to the conversation'}
          </label>
          <textarea
            id="reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => send(false)}
              disabled={busy}
            >
              {busy ? 'Sending...' : 'Send'}
            </button>
            {isStaff && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => send(true)}
                  disabled={busy}
                >
                  Internal note
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => send(false, true)}
                  disabled={busy}
                >
                  Reply and close
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
