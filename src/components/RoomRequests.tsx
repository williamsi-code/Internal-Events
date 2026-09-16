'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RoomRequest, DecidedRoom } from '@/lib/rooms';

/**
 * Confirming room bookings.
 *
 * Nearly all of these are yes. The interface is built for that: one
 * button per row, with a reason only needed when saying no.
 */

export default function RoomRequests({
  requests,
  recent,
}: {
  requests: RoomRequest[];
  recent: DecidedRoom[];
}) {
  const router = useRouter();
  const [refusing, setRefusing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function decide(id: string, confirm: boolean, withNote?: string) {
    setBusy(id);
    setError('');
    try {
      const res = await fetch('/api/bookings/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'decide',
          bookingId: id,
          confirm,
          note: withNote?.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy('');
        return;
      }
      setRefusing(null);
      setNote('');
      router.refresh();
      setBusy('');
    } catch {
      setError('Could not reach the server.');
      setBusy('');
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {requests.length === 0 ? (
        <div className="card">
          <h2>Nothing waiting</h2>
          <p className="hint">
            Room bookings made by staff confirm themselves. These are the ones
            asked for by everyone else.
          </p>
        </div>
      ) : (
        <div className="room-list">
          {requests.map((r) => (
            <div
              className={`room-row${r.days_away <= 2 ? ' soon' : ''}`}
              key={r.id}
            >
              <div className="room-main">
                <div className="room-top">
                  <span className="room-title">{r.title}</span>
                  {r.days_away <= 2 && (
                    <span className="pill p-flag">
                      {r.days_away <= 0
                        ? 'Today'
                        : r.days_away === 1
                          ? 'Tomorrow'
                          : `In ${r.days_away} days`}
                    </span>
                  )}
                </div>
                <span className="room-when">
                  {r.space_name}
                  {r.building ? ` \u00b7 ${r.building}` : ''}
                  <br />
                  {r.event_date_long} {'\u00b7'} {r.start_time} {'\u2013'}{' '}
                  {r.end_time}
                </span>
                <span className="room-who">
                  {r.requested_by_name}
                  {r.department_org ? ` \u00b7 ${r.department_org}` : ''}
                  {r.quick_attendance
                    ? ` \u00b7 about ${r.quick_attendance} people`
                    : ''}
                </span>
                {r.quick_purpose && (
                  <span className="room-note">{r.quick_purpose}</span>
                )}
                <span className="room-asked">Asked {r.asked_at}</span>
              </div>

              <div className="room-actions">
                {refusing === r.id ? (
                  <div className="room-refuse">
                    <label className="sr-only" htmlFor={`n-${r.id}`}>
                      Why not
                    </label>
                    <input
                      id={`n-${r.id}`}
                      type="text"
                      placeholder="Why not, in a sentence"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="actions">
                      <button
                        className="btn btn-ghost danger"
                        disabled={busy === r.id}
                        onClick={() => decide(r.id, false, note)}
                      >
                        Refuse and tell them
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setRefusing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      className="btn btn-primary"
                      disabled={busy === r.id}
                      onClick={() => decide(r.id, true)}
                    >
                      {busy === r.id ? 'Saving...' : 'Confirm'}
                    </button>
                    <button
                      className="edit-link"
                      onClick={() => {
                        setRefusing(r.id);
                        setNote('');
                      }}
                    >
                      Cannot do it
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2 className="bo-heading">Recently answered</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Who asked</th>
                <th>Answer</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="admin-name">{d.title}</span>
                    <span className="admin-sub">
                      {d.space_name} {'\u00b7'} {d.event_date_long}{' '}
                      {'\u00b7'} {d.start_time}
                    </span>
                  </td>
                  <td>
                    <span className="admin-sub">{d.requested_by_name}</span>
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        d.quick_state === 'confirmed'
                          ? 'p-classified'
                          : 'p-cancelled'
                      }`}
                    >
                      {d.quick_state === 'confirmed' ? 'Confirmed' : 'Refused'}
                    </span>
                    <span className="admin-sub">
                      {d.decided_by_name} {'\u00b7'} {d.decided_at}
                    </span>
                    {d.decision_note && (
                      <span className="admin-sub">{d.decision_note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
