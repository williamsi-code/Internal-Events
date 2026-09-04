'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SpaceRow } from '@/lib/scheduler';
import type { Closure } from '@/lib/scheduler-extras';

const KINDS = [
  ['maintenance', 'Maintenance'],
  ['renovation', 'Renovation'],
  ['seasonal', 'Closed for the season'],
  ['reserved', 'Held for something else'],
  ['other', 'Other'],
] as const;

export default function SpaceClosures({
  spaces,
  closures,
}: {
  spaces: SpaceRow[];
  closures: Closure[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');

  const [f, setF] = useState({
    spaceId: spaces[0]?.id ?? '',
    kind: 'maintenance' as (typeof KINDS)[number][0],
    startsOn: '',
    endsOn: '',
    reason: '',
    blocksBooking: true,
  });

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return null;
      }
      setBusy(false);
      router.refresh();
      return d;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
      return null;
    }
  }

  async function create() {
    if (!f.startsOn || !f.endsOn || !f.reason.trim()) {
      setError('Give dates and a reason.');
      return;
    }
    const d = await send({ action: 'createClosure', ...f });
    if (d) {
      setOpen(false);
      setF({ ...f, startsOn: '', endsOn: '', reason: '' });
      if (d.affected > 0) {
        setWarning(
          `${d.affected} event${d.affected === 1 ? ' is' : 's are'} already booked in that room during those dates. They have not been moved.`
        );
      }
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {warning && (
        <div className="callout c-flag">
          <strong>Events already booked in that period</strong>
          {warning} Nothing was cancelled, because you may be closing the room
          precisely so those can be moved.
        </div>
      )}

      {closures.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>When</th>
              <th>Why</th>
              <th className="num">Events</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {closures.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="admin-name">{c.space_name}</span>
                  {c.building && (
                    <span className="admin-sub">{c.building}</span>
                  )}
                  <span className="people-flags">
                    {c.active_now && (
                      <span className="pill p-flag">Out of service now</span>
                    )}
                    {!c.blocks_booking && (
                      <span className="pill p-review">Warning only</span>
                    )}
                  </span>
                </td>
                <td>
                  <span className="admin-sub">
                    {c.starts_on} to {c.ends_on}
                  </span>
                </td>
                <td>
                  <span className="admin-sub">{c.reason}</span>
                </td>
                <td className="num">
                  {c.events_affected > 0 ? (
                    <span className="pill p-flag">{c.events_affected}</span>
                  ) : (
                    '\u2014'
                  )}
                </td>
                <td className="num">
                  <button
                    className="edit-link"
                    disabled={busy}
                    onClick={() =>
                      send({ action: 'deleteClosure', closureId: c.id })
                    }
                  >
                    Bring back
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <div className="admin-editor">
          <h3>Take a room out of service</h3>

          <div className="grid two">
            <div className="field">
              <label htmlFor="cl-space">Room</label>
              <select
                id="cl-space"
                value={f.spaceId}
                onChange={(e) => set({ spaceId: e.target.value })}
              >
                {spaces.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.building ? `${s.building} \u2014 ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cl-kind">Why</label>
              <select
                id="cl-kind"
                value={f.kind}
                onChange={(e) => set({ kind: e.target.value as typeof f.kind })}
              >
                {KINDS.map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cl-from">From</label>
              <input
                id="cl-from"
                type="date"
                value={f.startsOn}
                onChange={(e) => set({ startsOn: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cl-to">Until</label>
              <p className="sub">Inclusive. The last day it is unavailable.</p>
              <input
                id="cl-to"
                type="date"
                value={f.endsOn}
                onChange={(e) => set({ endsOn: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="cl-reason">What is happening</label>
            <p className="sub">
              Shown on the schedule, so make it something a colleague would
              understand at a glance.
            </p>
            <input
              id="cl-reason"
              type="text"
              placeholder="Carpet replacement"
              value={f.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          </div>

          <label className="chk-inline">
            <input
              type="checkbox"
              checked={f.blocksBooking}
              onChange={(e) => set({ blocksBooking: e.target.checked })}
            />
            Refuse new bookings in this period
          </label>
          <p className="sub">
            Untick to warn without refusing, which suits a room pencilled out
            for something that may not happen.
          </p>

          <div className="actions">
            <button className="btn btn-primary" onClick={create} disabled={busy}>
              {busy ? 'Saving...' : 'Take it out of service'}
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setOpen(true)}>
            Take a room out of service
          </button>
        </div>
      )}
    </>
  );
}
