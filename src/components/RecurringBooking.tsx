'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SpaceRow } from '@/lib/scheduler';
import type { SeriesPreviewRow } from '@/lib/scheduler-extras';

const DAYS = [
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
] as const;

const KINDS = [
  ['weekly', 'Every week'],
  ['fortnightly', 'Every other week'],
  ['monthly_date', 'Same date each month'],
  ['monthly_weekday', 'Same weekday each month'],
] as const;

export default function RecurringBooking({ spaces }: { spaces: SpaceRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SeriesPreviewRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(
    null
  );

  const [f, setF] = useState({
    spaceId: spaces[0]?.id ?? '',
    title: '',
    note: '',
    kind: 'weekly' as (typeof KINDS)[number][0],
    weekdays: [1] as number[],
    startsOn: '',
    endsOn: '',
    startTime: '09:00',
    endTime: '10:00',
    setupMinutes: 0,
    teardownMinutes: 0,
  });
  const [skipClashes, setSkipClashes] = useState(true);

  const set = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch });
    setPreview(null);
    setDone(null);
  };

  const toggleDay = (d: number) =>
    set({
      weekdays: f.weekdays.includes(d)
        ? f.weekdays.filter((x) => x !== d)
        : [...f.weekdays, d].sort(),
    });

  const needsWeekdays = f.kind === 'weekly' || f.kind === 'fortnightly';

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
        setError(d.error ?? 'Something went wrong.');
        setBusy(false);
        return null;
      }
      setBusy(false);
      return d;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
      return null;
    }
  }

  const base = () => ({
    spaceId: f.spaceId,
    kind: f.kind,
    weekdays: needsWeekdays ? f.weekdays : [],
    startsOn: f.startsOn,
    endsOn: f.endsOn,
    startTime: f.startTime,
    endTime: f.endTime,
  });

  async function runPreview() {
    if (!f.startsOn || !f.endsOn) {
      setError('Choose a start and end date.');
      return;
    }
    if (needsWeekdays && f.weekdays.length === 0) {
      setError('Choose at least one day of the week.');
      return;
    }
    const d = await send({ action: 'preview', ...base() });
    if (d) setPreview(d.dates);
  }

  async function commit() {
    if (!f.title.trim()) {
      setError('Give the booking a name.');
      return;
    }
    const d = await send({
      action: 'createSeries',
      ...base(),
      title: f.title,
      note: f.note || null,
      setupMinutes: f.setupMinutes,
      teardownMinutes: f.teardownMinutes,
      skipClashes,
    });
    if (d) {
      setDone({ created: d.created, skipped: d.skipped });
      setPreview(null);
      router.refresh();
    }
  }

  const blocked = preview?.filter((p) => p.closed) ?? [];
  const clashing = preview?.filter((p) => !p.closed && p.clash) ?? [];
  const clean = preview?.filter((p) => !p.closed && !p.clash) ?? [];
  const willCreate = clean.length + (skipClashes ? 0 : clashing.length);

  if (!open) {
    return (
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          Book a recurring event
        </button>
      </div>
    );
  }

  return (
    <div className="admin-editor">
      <h3>Recurring booking</h3>
      <p className="sub">
        A weekly meeting booked one date at a time is thirty chances to miss
        one. Set the pattern, check the dates, then create them together.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {done && (
        <div className="callout c-default">
          <strong>
            Created {done.created} booking{done.created === 1 ? '' : 's'}
          </strong>
          {done.skipped > 0 &&
            `${done.skipped} date${done.skipped === 1 ? ' was' : 's were'} skipped.`}
        </div>
      )}

      <div className="grid two">
        <div className="field">
          <label htmlFor="rb-space">Room</label>
          <select
            id="rb-space"
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
          <label htmlFor="rb-title">What is it?</label>
          <input
            id="rb-title"
            type="text"
            placeholder="Faculty senate"
            value={f.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="rb-kind">How often</label>
        <select
          id="rb-kind"
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

      {needsWeekdays && (
        <div className="field">
          <label>On which days</label>
          <div className="weekday-picker">
            {DAYS.map(([label, n]) => (
              <button
                key={n}
                type="button"
                className="weekday"
                aria-pressed={f.weekdays.includes(n)}
                onClick={() => toggleDay(n)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid two">
        <div className="field">
          <label htmlFor="rb-from">First date</label>
          <input
            id="rb-from"
            type="date"
            value={f.startsOn}
            onChange={(e) => set({ startsOn: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="rb-to">Last date</label>
          <input
            id="rb-to"
            type="date"
            value={f.endsOn}
            onChange={(e) => set({ endsOn: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="rb-start">Start time</label>
          <input
            id="rb-start"
            type="time"
            value={f.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="rb-end">End time</label>
          <input
            id="rb-end"
            type="time"
            value={f.endTime}
            onChange={(e) => set({ endTime: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="rb-setup">Setup (minutes)</label>
          <input
            id="rb-setup"
            type="number"
            min={0}
            value={f.setupMinutes}
            onChange={(e) =>
              set({ setupMinutes: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="rb-teardown">Teardown (minutes)</label>
          <input
            id="rb-teardown"
            type="number"
            min={0}
            value={f.teardownMinutes}
            onChange={(e) =>
              set({ teardownMinutes: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="rb-note">Note</label>
        <input
          id="rb-note"
          type="text"
          value={f.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>

      {preview && (
        <>
          <div className="cap-facts" style={{ marginTop: '1rem' }}>
            <div className="cap-fact">
              <span className="cap-n">{clean.length}</span>
              <span className="cap-l">dates free</span>
            </div>
            <div className={`cap-fact${clashing.length ? ' warn' : ''}`}>
              <span className="cap-n">{clashing.length}</span>
              <span className="cap-l">already booked</span>
            </div>
            <div className={`cap-fact${blocked.length ? ' bad' : ''}`}>
              <span className="cap-n">{blocked.length}</span>
              <span className="cap-l">room out of service</span>
            </div>
          </div>

          {(clashing.length > 0 || blocked.length > 0) && (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>What is in the way</th>
                  </tr>
                </thead>
                <tbody>
                  {[...blocked, ...clashing].slice(0, 20).map((p) => (
                    <tr key={p.date}>
                      <td>
                        {p.weekday} {p.date}
                      </td>
                      <td>
                        {p.closed ? (
                          <span className="pill p-flag">{p.closed}</span>
                        ) : (
                          <span className="admin-sub">{p.clash}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {clashing.length > 0 && (
            <label className="chk-inline" style={{ marginTop: '.8rem' }}>
              <input
                type="checkbox"
                checked={skipClashes}
                onChange={(e) => setSkipClashes(e.target.checked)}
              />
              Skip the dates that are already booked
            </label>
          )}

          <p className="sub">
            Dates where the room is out of service are always skipped.
          </p>
        </>
      )}

      <div className="actions">
        {!preview ? (
          <button className="btn btn-primary" onClick={runPreview} disabled={busy}>
            {busy ? 'Checking...' : 'Check the dates'}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={commit}
            disabled={busy || willCreate === 0}
          >
            {busy
              ? 'Creating...'
              : `Create ${willCreate} booking${willCreate === 1 ? '' : 's'}`}
          </button>
        )}
        <button
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setDone(null);
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
