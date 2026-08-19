'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { classificationLabel } from '@/lib/classify';
import type { MyRequestDetail, Message } from '@/lib/requests';

const VERDICT_CLASS: Record<string, string> = {
  internal: 'internal',
  affiliated: 'affiliated',
  external: 'external',
  needs_management_review: 'review',
};

const WHAT_IT_MEANS: Record<string, string> = {
  internal:
    'Internal policies apply, and your department is charged for food and disposables only.',
  affiliated:
    'This is a partnership between Central and an outside group, so cost-recovery rates apply.',
  external:
    'External policies apply. A contract, proof of insurance, and commercial rates are required.',
  needs_management_review:
    'A manager is reviewing this before it can be classified. You will hear back shortly.',
};

export default function RequesterActions({
  request,
  messages,
}: {
  request: MyRequestDetail;
  messages: Message[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const needsAck =
    !!request.current_classification &&
    request.current_classification !== 'needs_management_review' &&
    !request.acknowledged_at;

  async function act(action: 'acknowledge' | 'question') {
    if (action === 'question' && !question.trim()) {
      setError('Write your question first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/requests/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          action,
          body: action === 'question' ? question : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Something went wrong.');
        setBusy(false);
        return;
      }
      setQuestion('');
      setAsking(false);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      {request.current_classification && (
        <div className="sec">
          <div className="sec-head">
            <h3>Classification</h3>
          </div>

          <p className={`verdict ${VERDICT_CLASS[request.current_classification]}`}>
            {classificationLabel(request.current_classification)}
          </p>
          <p className="verdict-note">
            {WHAT_IT_MEANS[request.current_classification]}
          </p>

          <div className="recorded" style={{ marginTop: '1rem' }}>
            {request.decision_rationale}
            <span className="when">Decided {request.decided_at}</span>
          </div>

          {request.acknowledged_at ? (
            <div className="callout c-default">
              <strong>You confirmed this on {request.acknowledged_at}</strong>
              The events office is preparing the next steps for your event.
            </div>
          ) : needsAck ? (
            <>
              <div className="callout c-warn">
                <strong>Your confirmation is needed</strong>
                Confirm that you understand how this event has been classified,
                or ask a question if something does not look right.
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="actions">
                <button
                  className="btn btn-primary"
                  onClick={() => act('acknowledge')}
                  disabled={busy}
                >
                  {busy ? 'Confirming...' : 'Confirm and continue'}
                </button>
                <button className="btn btn-ghost" onClick={() => setAsking(true)}>
                  Ask a question
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="sec">
        <div className="sec-head">
          <h3>Messages</h3>
        </div>

        {messages.length === 0 ? (
          <p className="empty" style={{ marginBottom: '1rem' }}>
            No messages yet. The events office will be in touch if they need
            anything.
          </p>
        ) : (
          <ul className="thread">
            {messages.map((m) => (
              <li key={m.id} className={m.is_staff ? 'outbound' : ''}>
                <div className="who">
                  {m.is_staff ? 'Events & Conferences' : 'You'} {'\u00b7'}{' '}
                  {m.created_at}
                </div>
                {m.body}
              </li>
            ))}
          </ul>
        )}

        {(asking || request.status === 'info_requested' || !needsAck) && (
          <>
            {error && !asking && <div className="alert alert-error">{error}</div>}
            <label className="lbl" htmlFor="question">
              {request.status === 'info_requested'
                ? 'Reply to the events office'
                : 'Ask a question'}
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={() => act('question')}
                disabled={busy}
              >
                {busy ? 'Sending...' : 'Send'}
              </button>
              {asking && (
                <button className="btn btn-ghost" onClick={() => setAsking(false)}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}