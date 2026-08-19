'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { classificationLabel, type Classification } from '@/lib/classify';
import type { RequestDetail, Message } from '@/lib/requests';

const OPTIONS: Classification[] = [
  'internal',
  'affiliated',
  'external',
  'needs_management_review',
];

const VERDICT_CLASS: Record<string, string> = {
  internal: 'internal',
  affiliated: 'affiliated',
  external: 'external',
  needs_management_review: 'review',
};

export default function DecisionPanel({
  request,
  messages,
}: {
  request: RequestDetail;
  messages: Message[];
}) {
  const router = useRouter();

  const [classification, setClassification] = useState<string>(
    request.current_classification ?? ''
  );
  const [rationale, setRationale] = useState('');
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState('');
  const [msgError, setMsgError] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);

  const decided = !!request.current_classification && !reopening;

  async function recordDecision() {
    if (!classification || !rationale.trim()) {
      setError('Choose a classification and give a rationale.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          classification,
          rationale,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not record the decision.');
        setBusy(false);
        return;
      }
      setReopening(false);
      setRationale('');
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  async function send(isInternal: boolean) {
    if (!message.trim()) {
      setMsgError('Write something first.');
      return;
    }
    setMsgBusy(true);
    setMsgError('');
    try {
      const res = await fetch('/api/staff/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          body: message,
          isInternal,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setMsgError(d.error ?? 'Could not send.');
        setMsgBusy(false);
        return;
      }
      setMessage('');
      router.refresh();
      setMsgBusy(false);
    } catch {
      setMsgError('Could not reach the server.');
      setMsgBusy(false);
    }
  }

  /* Which callout leads section E depends on how confident the
     matrix is about this event type. */
  const callout = !request.event_type_name ? (
    <div className="callout c-warn">
      <strong>Event type not listed</strong>
      The requester described it as &ldquo;{request.event_type_other}&rdquo;.
      Classify it directly, and consider whether it should be added to the
      matrix.
    </div>
  ) : request.always_review ? (
    <div className="callout c-warn">
      <strong>This event type is always reviewed</strong>
      The matrix does not settle &ldquo;{request.event_type_name}&rdquo;.
      {request.type_guidance ? ` ${request.type_guidance}` : ''}
    </div>
  ) : request.deviates_from_type ? (
    <div className="callout c-flag">
      <strong>Answers differ from the usual result for this type</strong>
      {request.deviation_detail ??
        'The requester answers point somewhere other than the matrix default.'}
    </div>
  ) : (
    <div className="callout c-default">
      <strong>
        Matrix default:{' '}
        {request.default_classification
          ? classificationLabel(request.default_classification)
          : 'none'}
      </strong>
      Based on the event type &ldquo;{request.event_type_name}&rdquo;. The
      requester&rsquo;s answers agree.
    </div>
  );

  return (
    <>
      <div className="sec">
        <div className="sec-head">
          <span className="sec-letter">E</span>
          <h3>Classification decision</h3>
        </div>

        {decided ? (
          <>
            <div className="recorded">
              <strong
                className={`verdict-inline ${
                  VERDICT_CLASS[request.current_classification!]
                }`}
              >
                {classificationLabel(request.current_classification!)}
              </strong>
              <br />
              {request.decision_rationale}
              <span className="when">
                {request.decided_by_name} {'\u00b7'} {request.decided_at}
              </span>
            </div>
            <button className="btn btn-ghost" onClick={() => setReopening(true)}>
              Reclassify
            </button>
            <p className="sub" style={{ marginTop: '.6rem' }}>
              The previous decision stays in the record.
            </p>
          </>
        ) : (
          <>
            {callout}

            {error && <div className="alert alert-error">{error}</div>}

            <div className="choices" role="radiogroup" aria-label="Classification">
              {OPTIONS.map((o) => (
                <label className="choice" key={o}>
                  <input
                    type="radio"
                    name="classification"
                    value={o}
                    checked={classification === o}
                    onChange={() => setClassification(o)}
                  />
                  {classificationLabel(o)}
                </label>
              ))}
            </div>

            <label className="lbl" htmlFor="rationale">
              Classification rationale
            </label>
            <p className="sub">
              Written for the requester. Explain why, in terms they will
              understand.
            </p>
            <textarea
              id="rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />

            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={recordDecision}
                disabled={busy}
              >
                {busy ? 'Recording...' : 'Record decision'}
              </button>
              {reopening && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setReopening(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="sec">
        <div className="sec-head">
          <h3>Messages and notes</h3>
        </div>
        <p className="sec-note">
          A question to the requester moves this request to &ldquo;awaiting
          requester&rdquo;. Internal notes are never shown to them and do not
          change the status.
        </p>

        {messages.length === 0 ? (
          <p className="empty" style={{ marginBottom: '1rem' }}>
            No messages yet.
          </p>
        ) : (
          <ul className="thread">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.is_internal ? 'internal' : m.is_staff ? 'outbound' : ''
                }
              >
                <div className="who">
                  {m.author_name} {'\u00b7'} {m.created_at}
                  {m.is_internal ? ' \u00b7 internal note' : ''}
                </div>
                {m.body}
              </li>
            ))}
          </ul>
        )}

        {msgError && <div className="alert alert-error">{msgError}</div>}

        <label className="lbl" htmlFor="message">
          Add a message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask a question, or record an internal note."
        />
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => send(false)}
            disabled={msgBusy}
          >
            Send to requester
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => send(true)}
            disabled={msgBusy}
          >
            Save as internal note
          </button>
        </div>
      </div>
    </>
  );
}