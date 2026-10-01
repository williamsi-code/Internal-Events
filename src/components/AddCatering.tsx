'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Adding food to a room booking.
 *
 * The room stays exactly as it is; an event request grows around it.
 * Nothing is released and re-taken, because a gap of even a second
 * is a gap somebody else could book into.
 */

export default function AddCatering({
  bookingId,
  title,
  attendance,
  supportsCatering,
  isStaff,
}: {
  bookingId: string;
  title: string;
  attendance: number | null;
  supportsCatering: boolean;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [eventName, setEventName] = useState(title);
  const [description, setDescription] = useState('');
  const [count, setCount] = useState(attendance ? String(attendance) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!supportsCatering) {
    return (
      <p className="sub">
        This room is marked as no food or drink, so catering cannot be added
        to it. The events office can suggest somewhere that takes it.
      </p>
    );
  }

  async function convert() {
    if (!count || Number(count) < 1) {
      setError('How many people are eating?');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/bookings/add-catering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          eventName: eventName.trim() || null,
          description: description.trim() || null,
          attendance: Number(count),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not do that.');
        setBusy(false);
        return;
      }
      router.push(isStaff ? `/staff/${d.id}` : `/my-requests/${d.id}`);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="add-catering">
        <div>
          <strong>Want food with this?</strong>
          <span>
            The room stays exactly as booked and we build the rest around it.
          </span>
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          Add catering
        </button>
      </div>
    );
  }

  return (
    <div className="add-catering open">
      <h4>Adding catering</h4>
      <p className="sub">
        Your room booking stays as it is. This adds an event request around
        it, which the events office will classify so we know what it costs
        you.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="ac-name">What is it called?</label>
          <input
            id="ac-name"
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ac-count">How many eating?</label>
          <input
            id="ac-count"
            type="number"
            inputMode="numeric"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="ac-desc">Tell us about it</label>
        <p className="sub">
          What is happening and who is coming. This is what the events office
          reads when working out how it is classified.
        </p>
        <textarea
          id="ac-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={convert} disabled={busy}>
          {busy ? 'Setting it up...' : 'Add catering'}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
