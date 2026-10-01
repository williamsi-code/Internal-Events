'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AddCatering from './AddCatering';

/**
 * Booking a meeting room in one step.
 *
 * Opened by clicking an empty slot on the scheduler, so the room and
 * the day are already known. Four fields and a check that the slot is
 * still free, because it may have gone while they were typing.
 *
 * Deliberately not a route to the intake form. Anything with food
 * goes there; this is for the committee that wants a room for an
 * hour.
 */

interface CheckResult {
  ok: boolean;
  problem: string | null;
  clash_title: string | null;
  closure_reason: string | null;
  supports_catering: boolean | null;
  space_name: string | null;
}

export default function QuickBooking({
  spaceId,
  spaceName,
  building,
  date,
  startTime,
  isStaff,
  onClose,
}: {
  spaceId: string;
  spaceName: string;
  building: string | null;
  date: string;
  /** Where they clicked, rounded to the hour. */
  startTime: string;
  isStaff: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(() => {
    const [h, m] = startTime.split(':').map(Number);
    return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [attendance, setAttendance] = useState('');

  const [check, setCheck] = useState<CheckResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    confirmed: boolean;
    bookingId: string;
  } | null>(null);

  // Check the slot whenever the times change, so a clash shows before
  // they have filled anything in.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/bookings/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'check',
        spaceId,
        date,
        startTime: start,
        endTime: end,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCheck(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spaceId, date, start, end]);

  async function book() {
    if (!title.trim()) {
      setError('Give it a name so people know what the room is for.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/bookings/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'book',
          spaceId,
          date,
          startTime: start,
          endTime: end,
          title: title.trim(),
          purpose: purpose.trim() || null,
          attendance: Number(attendance) || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(
          d.clash ? `${d.error} (${d.clash})` : (d.error ?? 'Could not book it.')
        );
        setBusy(false);
        return;
      }
      setDone({ confirmed: d.confirmed, bookingId: d.bookingId });
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const when = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (done) {
    return (
      <div className="booking-panel quick-booking">
        <div className="booking-head">
          <div>
            <span className="pill p-classified">
              {done.confirmed ? 'Booked' : 'Requested'}
            </span>
            <h3>{title}</h3>
            <p className="sub">
              {spaceName} {'\u00b7'} {when}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="callout c-default">
          <strong>
            {done.confirmed
              ? 'The room is yours'
              : 'Sent to the events office'}
          </strong>
          {done.confirmed
            ? 'It is on the schedule now. Anyone looking at that room will see it.'
            : 'The room is held pending their confirmation. It shows on the schedule as tentative in the meantime.'}
        </div>

        {/* The moment someone is most likely to realise they also
            want food is the moment the room is theirs. */}
        {check?.supports_catering && (
          <AddCatering
            bookingId={done.bookingId}
            title={title}
            attendance={Number(attendance) || null}
            supportsCatering
            isStaff={isStaff}
          />
        )}

        <div className="actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const blocked = check && !check.ok;

  return (
    <div className="booking-panel quick-booking">
      <div className="booking-head">
        <div>
          <span className="eyebrow">Book a room</span>
          <h3>{spaceName}</h3>
          <p className="sub">
            {building ? `${building} \u00b7 ` : ''}
            {when}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="sec-note">
        For the room only. If you want food, tables laid out or anything set
        up, <Link href="/start">start an event request</Link> instead.
      </p>

      <div className="grid two">
        <div className="field">
          <label htmlFor="qb-start">From</label>
          <input
            id="qb-start"
            type="time"
            step={1800}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="qb-end">Until</label>
          <input
            id="qb-end"
            type="time"
            step={1800}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      {blocked && (
        <div className="callout c-flag">
          <strong>{check.problem}</strong>
          {check.clash_title ? `${check.clash_title} is in there.` : ''}
          {check.closure_reason ?? ''}
        </div>
      )}

      {check?.ok && check.closure_reason && (
        <div className="callout c-warn">
          <strong>Worth knowing</strong>
          {check.closure_reason}
        </div>
      )}

      <div className="field">
        <label htmlFor="qb-title">What is it?</label>
        <p className="sub">
          Shown on the schedule to anyone who can see that room.
        </p>
        <input
          id="qb-title"
          type="text"
          placeholder="Faculty senate"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid two">
        <div className="field">
          <label htmlFor="qb-count">Roughly how many?</label>
          <input
            id="qb-count"
            type="number"
            inputMode="numeric"
            min={1}
            value={attendance}
            onChange={(e) => setAttendance(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="qb-purpose">Anything we should know?</label>
          <input
            id="qb-purpose"
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={book}
          disabled={busy || !!blocked}
        >
          {busy
            ? 'Booking...'
            : isStaff
              ? 'Book the room'
              : 'Request the room'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>

      {!isStaff && (
        <p className="sub" style={{ marginTop: '.6rem' }}>
          The events office confirms room bookings. Yours will hold the slot in
          the meantime.
        </p>
      )}
    </div>
  );
}
