'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Booking, SpaceRow, ConflictRow } from '@/lib/scheduler';

/**
 * Resource grid: spaces down the left, time across the top.
 *
 * A calendar answers "what is happening on the 14th". A resource grid
 * answers "is the Ballroom free", which is the question staff actually
 * arrive with. Every view keeps the same left column so the shape of
 * the room list never changes underneath you.
 */

type View = 'day' | 'week' | 'month';

const DAY_START = 6; // 6am
const DAY_END = 24; // midnight
const HOUR_WIDTH = 64;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

function label(view: View, anchor: Date) {
  if (view === 'day') {
    return anchor.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (view === 'week') {
    const start = addDays(anchor, -anchor.getDay());
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    return `${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} \u2013 ${end.toLocaleDateString('en-US', {
      month: sameMonth ? undefined : 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }
  return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ScheduleGrid({
  bookings,
  spaces,
  conflicts,
  view,
  anchorIso,
}: {
  bookings: Booking[];
  spaces: SpaceRow[];
  conflicts: ConflictRow[];
  view: View;
  anchorIso: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Booking | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [buildingFilter, setBuildingFilter] = useState('all');

  const anchor = new Date(anchorIso + 'T00:00:00');
  const todayIso = iso(new Date());

  const buildings = useMemo(
    () => [...new Set(spaces.map((s) => s.building ?? 'Other'))],
    [spaces]
  );

  const shownSpaces =
    buildingFilter === 'all'
      ? spaces
      : spaces.filter((s) => (s.building ?? 'Other') === buildingFilter);

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'week') {
      const start = addDays(anchor, -anchor.getDay());
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const count = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0
    ).getDate();
    return Array.from({ length: count }, (_, i) => addDays(first, i));
  }, [view, anchorIso]);

  /** Bookings for one space on one day. */
  const cell = (spaceId: string, dayIso: string) =>
    bookings.filter(
      (b) =>
        b.space_id === spaceId && b.day <= dayIso && b.end_day >= dayIso
    );

  function go(delta: number) {
    const step = view === 'day' ? 1 : view === 'week' ? 7 : 0;
    const next =
      view === 'month'
        ? new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
        : addDays(anchor, step * delta);
    router.push(`/staff/schedule?view=${view}&date=${iso(next)}`);
  }

  function setView(v: View) {
    router.push(`/staff/schedule?view=${v}&date=${anchorIso}`);
  }

  const hours = Array.from(
    { length: DAY_END - DAY_START },
    (_, i) => DAY_START + i
  );

  return (
    <>
      <div className="grid-bar">
        <div className="grid-nav">
          <button className="btn btn-ghost" onClick={() => go(-1)} aria-label="Previous">
            &larr;
          </button>
          <h2>{label(view, anchor)}</h2>
          <button className="btn btn-ghost" onClick={() => go(1)} aria-label="Next">
            &rarr;
          </button>
          <button
            className="btn btn-ghost"
            onClick={() =>
              router.push(`/staff/schedule?view=${view}&date=${todayIso}`)
            }
          >
            Today
          </button>
        </div>

        <div className="grid-tools">
          <div className="view-switch" role="group" aria-label="View">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                className="chip"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {buildings.length > 1 && (
            <select
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              aria-label="Filter by building"
            >
              <option value="all">All buildings</option>
              {buildings.map((b) => (
                <option value={b} key={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

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

      {showConflicts && (
        <div className="conflict-panel">
          <h3>Overlapping bookings</h3>
          <p className="sub">
            Two confirmed events cannot share a space, so these are holds that
            still need resolving.
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

      {shownSpaces.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          No spaces in this building.
        </p>
      ) : (
        <div className={`resgrid view-${view}`}>
          {/* ---------- header ---------- */}
          <div className="resgrid-head">
            <div className="resgrid-corner">Space</div>
            <div className="resgrid-scroll">
              {view === 'day' ? (
                <div
                  className="resgrid-hours"
                  style={{ width: hours.length * HOUR_WIDTH }}
                >
                  {hours.map((h) => (
                    <div
                      className="resgrid-hour"
                      key={h}
                      style={{ width: HOUR_WIDTH }}
                    >
                      {h === 12
                        ? 'Noon'
                        : h > 12
                          ? `${h - 12} PM`
                          : `${h} AM`}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="resgrid-days"
                  style={{
                    gridTemplateColumns: `repeat(${days.length}, minmax(${
                      view === 'week' ? 120 : 38
                    }px, 1fr))`,
                  }}
                >
                  {days.map((d) => (
                    <div
                      className={`resgrid-daycol${
                        iso(d) === todayIso ? ' today' : ''
                      }`}
                      key={iso(d)}
                    >
                      {view === 'week' ? (
                        <>
                          <span className="dow">
                            {d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span className="dnum">{d.getDate()}</span>
                        </>
                      ) : (
                        <span className="dnum">{d.getDate()}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------- rows ---------- */}
          <div className="resgrid-body">
            {shownSpaces.map((s) => (
              <div className="resgrid-row" key={s.id}>
                <div className="resgrid-label">
                  <span className="res-name">{s.name}</span>
                  <span className="res-sub">
                    {s.building}
                    {s.capacity_seated ? ` \u00b7 ${s.capacity_seated}` : ''}
                  </span>
                </div>

                <div className="resgrid-scroll">
                  {view === 'day' ? (
                    <div
                      className="resgrid-track"
                      style={{ width: hours.length * HOUR_WIDTH }}
                    >
                      {hours.map((h) => (
                        <div
                          className="resgrid-tick"
                          key={h}
                          style={{ width: HOUR_WIDTH }}
                        />
                      ))}
                      {cell(s.id, iso(anchor)).map((b) => {
                        const startsToday = b.day === iso(anchor);
                        const endsToday = b.end_day === iso(anchor);
                        const from = startsToday
                          ? Math.max(b.start_minutes, DAY_START * 60)
                          : DAY_START * 60;
                        const to = endsToday
                          ? Math.min(b.end_minutes, DAY_END * 60)
                          : DAY_END * 60;
                        if (to <= from) return null;
                        const left =
                          ((from - DAY_START * 60) / 60) * HOUR_WIDTH;
                        const width = Math.max(
                          ((to - from) / 60) * HOUR_WIDTH,
                          28
                        );
                        return (
                          <button
                            key={b.id}
                            className={`res-block ${b.status}${
                              b.is_blackout ? ' blackout' : ''
                            }${b.has_conflict ? ' conflict' : ''}`}
                            style={{ left, width }}
                            onClick={() => setSelected(b)}
                            title={`${b.title} \u00b7 ${b.starts_at}\u2013${b.ends_at}`}
                          >
                            <span className="res-block-title">{b.title}</span>
                            <span className="res-block-time">
                              {b.event_starts}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="resgrid-days"
                      style={{
                        gridTemplateColumns: `repeat(${days.length}, minmax(${
                          view === 'week' ? 120 : 38
                        }px, 1fr))`,
                      }}
                    >
                      {days.map((d) => {
                        const items = cell(s.id, iso(d));
                        return (
                          <div
                            className={`resgrid-cell${
                              iso(d) === todayIso ? ' today' : ''
                            }`}
                            key={iso(d)}
                          >
                            {items.map((b) => (
                              <button
                                key={b.id}
                                className={`res-chip ${b.status}${
                                  b.is_blackout ? ' blackout' : ''
                                }${b.has_conflict ? ' conflict' : ''}`}
                                onClick={() => setSelected(b)}
                                title={`${b.title} \u00b7 ${b.event_starts}`}
                              >
                                {view === 'week' ? (
                                  <>
                                    <span className="res-chip-time">
                                      {b.event_starts}
                                    </span>
                                    <span className="res-chip-title">
                                      {b.title}
                                    </span>
                                  </>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
