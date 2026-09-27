'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { classificationLabel, type Classification } from '@/lib/classify';
import type { RequestDetail, Message } from '@/lib/requests';
import type { ClassificationContext } from '@/lib/classification';

const OPTIONS: Classification[] = [
  'internal',
  'affiliated',
  'external',
  'needs_management_review',
];

const PARTY: Record<string, string> = {
  central: 'Central College',
  shared: 'Shared',
  outside: 'An outside party',
  unclear: 'They were not sure',
};

const VERDICT_CLASS: Record<string, string> = {
  internal: 'internal',
  affiliated: 'affiliated',
  external: 'external',
  needs_management_review: 'review',
};

export default function DecisionPanel({
  request,
  messages,
  context,
}: {
  request: RequestDetail;
  messages: Message[];
  /** Everything worth reading before deciding, in one place. */
  context: ClassificationContext | null;
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

  // A rationale is insisted on where someone will later ask why:
  // when this differs from how the same requester was classified
  // before, and when the answer is that it needs reviewing.
  const differsFromLast =
    !!classification &&
    !!context?.previous_classification &&
    classification !== context.previous_classification;

  const mustExplain =
    differsFromLast || classification === 'needs_management_review';

  async function recordDecision() {
    if (!classification) {
      setError('Choose a classification.');
      return;
    }
    if (mustExplain && !rationale.trim()) {
      setError(
        differsFromLast
          ? `This differs from how they were classified last time (${classificationLabel(
              context!.previous_classification as Classification
            )}), so please say why.`
          : 'Say what needs reviewing, so whoever picks it up knows where to start.'
      );
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
          rationale: rationale.trim() || null,
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
              {request.decision_rationale ?? (
                <span className="sub">
                  Matched the usual result for this event type.
                </span>
              )}
              <span className="when">
                {request.decided_by_name} {'·'} {request.decided_at}
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
            {context && (
              <div className="class-context">
                {context.event_description ? (
                  <div className="cc-description">
                    {context.event_description}
                  </div>
                ) : (
                  <p className="sub">
                    They did not describe it. The funding below is what there
                    is to go on.
                  </p>
                )}

                <dl className="cc-facts">
                  <div>
                    <dt>Type</dt>
                    <dd>
                      {context.event_type_name ??
                        `${context.event_type_other} (not listed)`}
                      {context.type_hint && (
                        <span className="cc-hint">
                          usually {classificationLabel(
                            context.type_hint as Classification
                          ).toLowerCase()}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Paying</dt>
                    <dd>
                      {context.budget_account
                        ? `Central account ${context.budget_account}`
                        : 'No Central account given'}
                    </dd>
                  </div>
                  <div>
                    <dt>Outside involvement</dt>
                    <dd>
                      {context.outside_org_name || 'None named'}
                      {context.outside_funding
                        ? ` · funded in part by ${
                            context.outside_funding_detail ?? 'an outside party'
                          }`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Revenue</dt>
                    <dd>
                      {context.revenue_collected
                        ? `Collected, to ${context.revenue_recipient ?? 'unstated'}`
                        : 'None collected'}
                    </dd>
                  </div>
                  <div>
                    <dt>Carries the risk</dt>
                    <dd>{PARTY[context.financial_risk_bearer ?? ''] ?? '—'}</dd>
                  </div>
                </dl>

                {context.previous_classification && (
                  <div className="cc-history">
                    <strong>
                      Last time:{' '}
                      {classificationLabel(
                        context.previous_classification as Classification
                      )}
                    </strong>
                    <span>
                      {context.previous_events} previous event
                      {context.previous_events === 1 ? '' : 's'} from{' '}
                      {context.department_org}. Classifying this one
                      differently is fine, but worth explaining.
                    </span>
                  </div>
                )}

                {context.awaiting_reprice > 0 && (
                  <div className="callout c-warn">
                    <strong>
                      They chose a menu before this was classified
                    </strong>
                    {context.awaiting_reprice} line
                    {context.awaiting_reprice === 1 ? '' : 's'} quoted at the
                    standard rate. Recording a decision reprices them and
                    tells the requester what changed.
                  </div>
                )}
              </div>
            )}

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
              {!mustExplain && <span className="optional">optional</span>}
            </label>
            <p className="sub">
              {mustExplain
                ? 'Needed here. Written for the requester, so explain it in terms they will understand.'
                : 'Optional. Add one if there is anything the requester should know.'}
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
                  {m.author_name} {'·'} {m.created_at}
                  {m.is_internal ? ' · internal note' : ''}
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