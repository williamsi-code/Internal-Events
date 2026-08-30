'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function EnquiryForm({ source }: { source?: string }) {
  const [f, setF] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
    eventType: '',
    approxDate: '',
    approxGuests: '',
    message: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function submit() {
    if (!f.name.trim() || !f.email.trim() || !f.message.trim()) {
      setError('We need your name, an email, and a message.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name,
          email: f.email,
          phone: f.phone || null,
          organization: f.organization || null,
          eventType: f.eventType || null,
          approxDate: f.approxDate || null,
          approxGuests: f.approxGuests ? Number(f.approxGuests) : null,
          message: f.message,
          source: source ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not send that.');
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Try emailing us directly.');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <span className="eyebrow">Sent</span>
        <h2>Thanks &mdash; we have it</h2>
        <p className="hint">
          Someone from the events office will get back to you at {f.email}. If
          it is urgent, call us on 641.628.5788.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
          Back to the front page
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="eyebrow">Enquiry</span>
      <h2>Ask us something</h2>
      <p className="hint">
        Nothing here is binding. Tell us roughly what you have in mind and we
        will come back with what is possible.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="en-name">Your name<span className="req">*</span></label>
          <input id="en-name" type="text" value={f.name}
            onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="en-email">Email<span className="req">*</span></label>
          <input id="en-email" type="email" value={f.email}
            onChange={(e) => set({ email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="en-phone">Phone</label>
          <input id="en-phone" type="tel" value={f.phone}
            onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="en-org">Organization</label>
          <input id="en-org" type="text" value={f.organization}
            onChange={(e) => set({ organization: e.target.value })} />
        </div>
      </div>

      <div className="grid two">
        <div className="field">
          <label htmlFor="en-type">What kind of event?</label>
          <input id="en-type" type="text" placeholder="Wedding reception, business lunch..."
            value={f.eventType}
            onChange={(e) => set({ eventType: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="en-date">Roughly when?</label>
          <input id="en-date" type="date" value={f.approxDate}
            onChange={(e) => set({ approxDate: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="en-guests">Roughly how many people?</label>
          <input id="en-guests" type="number" min={0} value={f.approxGuests}
            onChange={(e) => set({ approxGuests: e.target.value })} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="en-message">What would you like to know?<span className="req">*</span></label>
        <textarea id="en-message" value={f.message}
          onChange={(e) => set({ message: e.target.value })} />
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Sending...' : 'Send enquiry'}
        </button>
      </div>
    </div>
  );
}
