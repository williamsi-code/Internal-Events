'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Turning a room hold into a catered event.
 *
 * A booking knows the room and the time. Everything else has to be
 * asked, so this is a short form rather than a button - and it says
 * plainly what still will not be known afterwards.
 */

export default function ConvertBooking({
  bookingId,
  title,
  spaceName,
  onDone,
}: {
  bookingId: string;
  title: string;
  spaceName: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    requesterName: '',
    requesterEmail: '',
    department: '',
    phone: '',
    attendance: '',
    purpose: '',
  });

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function convert() {
    if (!f.requesterName.trim() || !f.requesterEmail.trim() || !f.department.trim()) {
      setError('We need a name, an email and a department.');
      return;
    }
    if (!Number(f.attendance)) {
      setError('Enter roughly how many people are expected.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/convert-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          requesterName: f.requesterName.trim(),
          requesterEmail: f.requesterEmail.trim().toLowerCase(),
          department: f.department.trim(),
          phone: f.phone.trim() || null,
          attendance: Number(f.attendance),
          purpose: f.purpose.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not convert that booking.');
        setBusy(false);
        return;
      }
      onDone?.();
      router.push(`/staff/${d.requestId}`);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        Add catering to this booking
      </button>
    );
  }

  return (
    <div className="convert-panel">
      <h4>Turn this into a catered event</h4>
      <p className="sub">
        {title} in {spaceName}. The room and the time carry over; everything
        else has to be asked.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="cv-name">Who is it for?</label>
          <input
            id="cv-name"
            type="text"
            value={f.requesterName}
            onChange={(e) => set({ requesterName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cv-email">Their email</label>
          <p className="sub">
            If they already have an account the event appears in their list and
            they can carry on themselves.
          </p>
          <input
            id="cv-email"
            type="email"
            value={f.requesterEmail}
            onChange={(e) => set({ requesterEmail: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cv-dept">Department or organization</label>
          <input
            id="cv-dept"
            type="text"
            value={f.department}
            onChange={(e) => set({ department: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cv-phone">Phone</label>
          <input
            id="cv-phone"
            type="text"
            value={f.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </div>
      </div>

      <div className="grid two">
        <div className="field">
          <label htmlFor="cv-count">Roughly how many people?</label>
          <input
            id="cv-count"
            type="number"
            min={1}
            value={f.attendance}
            onChange={(e) => set({ attendance: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cv-purpose">What is the event for?</label>
          <input
            id="cv-purpose"
            type="text"
            value={f.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
          />
        </div>
      </div>

      <div className="callout c-warn">
        <strong>The classification questions will still be unanswered</strong>
        Nobody was asked them when the room was booked, so the event arrives in
        the queue marked unknown. Answer them on the requester&rsquo;s behalf,
        or send them a message asking them to.
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={convert} disabled={busy}>
          {busy ? 'Converting...' : 'Create the event'}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
