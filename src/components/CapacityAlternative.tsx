'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CapacityState } from '@/lib/capacity-state';

/**
 * An offered alternative, on the requester's side.
 *
 * This was previously a message in a thread, which is prose where a
 * decision is needed. Someone reading "we could do the Sutphen Room
 * instead" has no obvious way to say yes.
 */

export default function CapacityAlternative({
  requestId,
  state,
  currentDate,
  currentSpace,
}: {
  requestId: string;
  state: CapacityState;
  currentDate: string;
  currentSpace: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (state.outcome !== 'alternative_offered') return null;

  // Already answered: show what happened rather than the controls.
  if (state.response) {
    return (
      <div className="sec">
        <div className="sec-head">
          <h3>The alternative we offered</h3>
        </div>
        <div className="callout c-default">
          <strong>
            {state.response === 'accepted'
              ? 'You accepted this'
              : 'You told us this would not work'}
          </strong>
          {state.response === 'accepted'
            ? 'Your event has been moved and is back with the events office.'
            : 'The events office is looking at what else might be possible.'}
        </div>
      </div>
    );
  }

  async function answer(accept: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/requests/alternative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, accept, note: note || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save your answer.');
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

  const dateChanging =
    state.proposed_date && state.proposed_date !== currentDate;
  const spaceChanging =
    state.proposed_space_name && state.proposed_space_name !== currentSpace;

  return (
    <div className="sec alternative-sec">
      <div className="sec-head">
        <h3>We have suggested an alternative</h3>
      </div>

      <p className="sec-note">
        We cannot do your event exactly as asked, but here is what we can do.
        Nothing changes until you tell us either way.
      </p>

      {state.proposed_detail && (
        <div className="alternative-offer">{state.proposed_detail}</div>
      )}

      {(dateChanging || spaceChanging) && (
        <table className="alternative-table">
          <thead>
            <tr>
              <th></th>
              <th>You asked for</th>
              <th>We can offer</th>
            </tr>
          </thead>
          <tbody>
            {dateChanging && (
              <tr>
                <td>Date</td>
                <td>
                  {new Date(currentDate + 'T00:00:00').toLocaleDateString(
                    'en-US',
                    { weekday: 'long', month: 'long', day: 'numeric' }
                  )}
                </td>
                <td className="strong">
                  {new Date(
                    state.proposed_date + 'T00:00:00'
                  ).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </td>
              </tr>
            )}
            {spaceChanging && (
              <tr>
                <td>Room</td>
                <td>{currentSpace ?? 'Not chosen'}</td>
                <td className="strong">{state.proposed_space_name}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {declining ? (
        <>
          <div className="field">
            <label htmlFor="alt-note">
              What would work better?
            </label>
            <p className="sub">
              Telling us why helps us find something else. We will keep looking.
            </p>
            <textarea
              id="alt-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => answer(false)}
              disabled={busy}
            >
              {busy ? 'Sending...' : 'Send this back'}
            </button>
            <button className="btn btn-ghost" onClick={() => setDeclining(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => answer(true)}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'That works, go ahead'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setDeclining(true)}
            disabled={busy}
          >
            That does not work
          </button>
        </div>
      )}
    </div>
  );
}
