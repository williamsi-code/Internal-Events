'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function EnquiryForm({
  source,
  userName,
}: {
  source?: string;
  userName: string;
}) {
  const [f, setF] = useState({
    phone: '',
    organization: '',
    eventType: '',
    approxDate: '',
    approxGuests: '',
    message: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState('');

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function submit() {
    if (!f.message.trim()) {
      setError('Tell us what you would like to know.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: f.phone || null,
          organization: f.organization || null,
          eventType: f.eventType || null,
          approxDate: f.approxDate || null,
          approxGuests: f.approxGuests ? Number(f.approxGuests) : null,
          message: f.message,
          source: source ?? null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not send that.');
        setBusy(false);
        return;
      }
      setReference(d.referenceCode);
    } catch {
      setError('Could not reach the server. Try calling us on 641.628.5788.');
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div className="card">
        <span className="eyebrow">Sent</span>
        <h2>Thanks &mdash; we have your question</h2>
        <p className="confirm-code">{reference}</p>
        <p className="hint">
          Someone from the events office will reply. The answer appears on your
          own page rather than in your inbox, so the whole conversation stays in
          one place.
        </p>
        <div className="actions">
          <Link
            href="/my-requests"
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            View my enquiries
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="eyebrow">Enquiry</span>
      <h2>Ask us something</h2>
      <p className="hint">
        Nothing here is binding. Tell us roughly what you have in mind,{' '}
        {userName.split(' ')[0]}, and we will come back with what is possible.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="en-type">What kind of event?</label>
          <input
            id="en-type"
            type="text"
            placeholder="Wedding reception, business lunch..."
            value={f.eventType}
            onChange={(e) => set({ eventType: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="en-org">Organization</label>
          <p className="sub">Leave blank for a private event.</p>
          <input
            id="en-org"
            type="text"
            value={f.organization}
            onChange={(e) => set({ organization: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="en-date">Roughly when?</label>
          <input
            id="en-date"
            type="date"
            value={f.approxDate}
            onChange={(e) => set({ approxDate: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="en-guests">Roughly how many people?</label>
          <input
            id="en-guests"
            type="number"
            min={0}
            value={f.approxGuests}
            onChange={(e) => set({ approxGuests: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="en-phone">Phone</label>
          <p className="sub">If you would rather we called.</p>
          <input
            id="en-phone"
            type="tel"
            value={f.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="en-message">
          What would you like to know?<span className="req">*</span>
        </label>
        <textarea
          id="en-message"
          value={f.message}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Sending...' : 'Send enquiry'}
        </button>
      </div>
    </div>
  );
}
