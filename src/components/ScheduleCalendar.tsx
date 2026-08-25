'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Booking, SpaceOption, ConflictRow } from '@/lib/scheduler';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor.getMonth() !== month && cursor.getDay() === 0) break;
  }
  return weeks;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

export default function ScheduleCalendar({
  bookings,
  spaces,
  conflicts,
  year,
  month,
}: {
  bookings: Booking[];
  spaces: SpaceOption[];
  conflicts: ConflictRow[];
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [spaceFilter, setSpaceFilter] = useState('all');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);

  const shown = useMemo(
    () =>
      spaceFilter === 'all'
        ? bookings
        : bookings.filter((b) => b.space_id === spaceFilter),
    [bookings, spaceFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of shown) {
      if (!map.has(b.day)) map.set(b.day, []);
      map.get(b.day)!.push(b);
    }
    return map;
  }, [shown]);

  const weeks = monthGrid(year, month);
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const todayIso = iso(new Date());

  function go(delta: number) {
    const d = new Date(year, month + delta, 1);
    router.push(`/staff/schedule?y=${d.getFullYear()}&m=${d.getMonth()}`);
  }

  return (
    <>
      <div className="cal-bar">
        <div className="cal-nav">
          <button className="btn btn-ghost" onClick={() => go(-1)}>
            &larr;
          </button>
          <h2>{monthName}</h2>
          <button className="btn btn-ghost" onClick={() => go(1)}>
            &rarr;
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const n = new Date();
              router.push(
                `/staff/schedule?y=${n.getFullYear()}&m=${n.getMonth()}`
              );
            }}
          >
            Today
          </button>
        </div>

        <div className="cal-tools">
          <select
            value={spaceFilter}
            onChange={(e) => setSpaceFilter(e.target.value)}
            aria-label="Filter by space"
          >
            <option value="all">All spaces</option>
            {spaces.map((s) => (
              <option value={s.id} key={s.id}>
                {s.building ? `${s.building} \u2014 ${s.name}` : s.name}
              </option>
            ))}
          </select>

          {conflicts.length > 0 && (
            <button
              className="btn btn-ghost conflict-btn"
              onClick={() => setShowConflicts((v) => !v)}
            >
              {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {showConflicts && conflicts.length > 0 && (
        <div className="conflict-panel">
          <h3>Overlapping bookings</h3>
          <p className="sub">
            Two confirmed events cannot share a space, so these are holds that
            still need resolving. Moving one, or releasing it, clears the
            conflict.
          </p>
          <ul>
            {conflicts.map((c) => (
              <li key={c.booking_id}>
                <span>
                  <strong>{c.space_name}</strong> {'\u00b7'} {c.day} {'\u00b7'}{' '}
                  {c.window}
                  <br />
                  <span className="conflict-pair">
                    {c.title} ({c.status}) vs {c.other_title} ({c.other_status})
                  </span>
                </span>
                {c.request_id && (
                  <Link href={`/staff/${c.request_id}`} className="edit-link">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cal-legend">
        <span className="legend-item">
          <span className="swatch confirmed" /> Confirmed
        </span>
        <span className="legend-item">
          <span className="swatch tentative" /> Tentative hold
        </span>
        <span className="legend-item">
          <span className="swatch blackout" /> Blackout
        </span>
        <span className="legend-item">
          <span className="swatch conflict" /> Overlapping
        </span>
      </div>

      <div className="calendar" role="grid">
        <div className="cal-head">
          {DAYS.map((d) => (
            <div key={d} className="cal-dayname">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className="cal-week" key={wi}>
            {week.map((date) => {
              const key = iso(date);
              const items = byDay.get(key) ?? [];
              const outside = date.getMonth() !== month;
              return (
                <div
                  className={`cal-day${outside ? ' outside' : ''}${
                    key === todayIso ? ' today' : ''
                  }`}
                  key={key}
                >
                  <div className="cal-date">{date.getDate()}</div>
                  {items.map((b) => (
                    <button
                      key={b.id}
                      className={`cal-event ${b.status}${
                        b.is_blackout ? ' blackout' : ''
                      }${b.has_conflict ? ' conflict' : ''}`}
                      onClick={() => setSelected(b)}
                    >
                      <span className="cal-event-time">{b.event_starts}</span>
                      <span className="cal-event-title">{b.title}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selected && (
        <BookingPanel booking={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function BookingPanel({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  const router = useRouter();
  const [setup, setSetup] = useState(booking.setup_minutes);
  const [teardown, setTeardown] = useState(booking.teardown_minutes);
  const [note, setNote] = useState(booking.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <div className="booking-panel">
      <div className="booking-head">
        <div>
          <span className={`pill p-${booking.status}`}>
            {booking.status === 'confirmed' ? 'Confirmed' : 'Tentative hold'}
          </span>
          <h3>{booking.title}</h3>
          <p className="sub">
            {booking.building ? `${booking.building} \u2014 ` : ''}
            {booking.space_name}
            {booking.attendance ? ` \u00b7 ${booking.attendance} guests` : ''}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {booking.has_conflict && (
        <div className="callout c-flag">
          <strong>Overlaps another booking in this space</strong>
          Resolve before this event is confirmed, or the confirmation will be
          refused.
        </div>
      )}

      <dl className="booking-dl">
        <dt>Event</dt>
        <dd>
          {booking.event_starts} {'\u2013'} {booking.event_ends}
        </dd>
        <dt>Room held</dt>
        <dd>
          {booking.starts_at} {'\u2013'} {booking.ends_at}
        </dd>
        {booking.reference_code && (
          <>
            <dt>Request</dt>
            <dd className="mono">{booking.reference_code}</dd>
          </>
        )}
      </dl>

      {error && <div className="alert alert-error">{error}</div>}

      {!booking.is_blackout && (
        <>
          <div className="grid two">
            <div className="field">
              <label htmlFor="setup">Setup (minutes)</label>
              <input
                id="setup"
                type="number"
                min={0}
                value={setup}
                onChange={(e) => setSetup(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label htmlFor="teardown">Teardown (minutes)</label>
              <input
                id="teardown"
                type="number"
                min={0}
                value={teardown}
                onChange={(e) => setTeardown(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="bnote">Note</label>
            <input
              id="bnote"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="actions">
        {!booking.is_blackout && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              send({
                action: 'buffers',
                bookingId: booking.id,
                setupMinutes: setup,
                teardownMinutes: teardown,
                note: note || null,
              })
            }
          >
            {busy ? 'Saving...' : 'Save times'}
          </button>
        )}
        {booking.request_id && (
          <Link
            href={`/staff/${booking.request_id}`}
            className="btn btn-ghost"
            style={{ textDecoration: 'none' }}
          >
            Open event
          </Link>
        )}
        {booking.is_blackout && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => send({ action: 'release', bookingId: booking.id })}
          >
            Remove block
          </button>
        )}
      </div>
    </div>
  );
}
