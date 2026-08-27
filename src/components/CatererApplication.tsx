'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function CatererApplication() {
  const [f, setF] = useState({
    businessName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    address: '',
    licenseNumber: '',
    licenseExpiresOn: '',
    insuranceCarrier: '',
    insuranceExpiresOn: '',
    servsafeCertified: false,
    healthInspectionOn: '',
    cuisineNotes: '',
    applicantNotes: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function submit() {
    if (!f.businessName.trim() || !f.contactName.trim() || !f.contactEmail.trim()) {
      setError('Business name, contact name, and email are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/caterers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          contactPhone: f.contactPhone || null,
          website: f.website || null,
          address: f.address || null,
          licenseNumber: f.licenseNumber || null,
          licenseExpiresOn: f.licenseExpiresOn || null,
          insuranceCarrier: f.insuranceCarrier || null,
          insuranceExpiresOn: f.insuranceExpiresOn || null,
          healthInspectionOn: f.healthInspectionOn || null,
          cuisineNotes: f.cuisineNotes || null,
          applicantNotes: f.applicantNotes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not submit your application.');
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <span className="eyebrow">Received</span>
        <h2>Your application is with the events office</h2>
        <p className="hint">
          Someone will review it and be in touch at {f.contactEmail}. Approval
          depends on current licensing, insurance naming Central College as an
          additional insured, and a satisfactory health inspection.
        </p>
        <Link href="/info/outside-caterer-policy" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
          Read the caterer requirements
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <span className="eyebrow">Application</span>
      <h2>Apply to cater at Central College</h2>
      <p className="hint">
        Only approved caterers may serve food on campus. Tell us about your
        business and your paperwork, and the events office will review it.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <h4 className="admin-h4">Your business</h4>
      <div className="grid two">
        <div className="field">
          <label htmlFor="ca-business">Business name<span className="req">*</span></label>
          <input id="ca-business" type="text" value={f.businessName}
            onChange={(e) => set({ businessName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-website">Website</label>
          <input id="ca-website" type="text" value={f.website}
            onChange={(e) => set({ website: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-contact">Contact name<span className="req">*</span></label>
          <input id="ca-contact" type="text" value={f.contactName}
            onChange={(e) => set({ contactName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-email">Email<span className="req">*</span></label>
          <input id="ca-email" type="email" value={f.contactEmail}
            onChange={(e) => set({ contactEmail: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-phone">Phone</label>
          <input id="ca-phone" type="tel" value={f.contactPhone}
            onChange={(e) => set({ contactPhone: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-address">Address</label>
          <input id="ca-address" type="text" value={f.address}
            onChange={(e) => set({ address: e.target.value })} />
        </div>
      </div>

      <h4 className="admin-h4">Licensing and insurance</h4>
      <p className="sub" style={{ marginTop: '-.4rem' }}>
        Insurance must name Central College as an additional insured. A lapsed
        certificate removes a caterer from the approved list until renewed.
      </p>
      <div className="grid two">
        <div className="field">
          <label htmlFor="ca-license">Food service license number</label>
          <input id="ca-license" type="text" value={f.licenseNumber}
            onChange={(e) => set({ licenseNumber: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-license-exp">License expires</label>
          <input id="ca-license-exp" type="date" value={f.licenseExpiresOn}
            onChange={(e) => set({ licenseExpiresOn: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-carrier">Insurance carrier</label>
          <input id="ca-carrier" type="text" value={f.insuranceCarrier}
            onChange={(e) => set({ insuranceCarrier: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-ins-exp">Insurance expires</label>
          <input id="ca-ins-exp" type="date" value={f.insuranceExpiresOn}
            onChange={(e) => set({ insuranceExpiresOn: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ca-health">Most recent health inspection</label>
          <input id="ca-health" type="date" value={f.healthInspectionOn}
            onChange={(e) => set({ healthInspectionOn: e.target.value })} />
        </div>
        <div className="field">
          <label className="chk-inline" style={{ marginTop: '1.8rem' }}>
            <input type="checkbox" checked={f.servsafeCertified}
              onChange={(e) => set({ servsafeCertified: e.target.checked })} />
            ServSafe certified staff
          </label>
        </div>
      </div>

      <h4 className="admin-h4">About your catering</h4>
      <div className="field">
        <label htmlFor="ca-cuisine">What do you serve?</label>
        <textarea id="ca-cuisine" value={f.cuisineNotes}
          onChange={(e) => set({ cuisineNotes: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="ca-notes">Anything else we should know</label>
        <textarea id="ca-notes" value={f.applicantNotes}
          onChange={(e) => set({ applicantNotes: e.target.value })} />
      </div>

      <div className="callout c-default">
        <strong>Before you apply</strong>
        Please read the{' '}
        <Link href="/info/outside-caterer-policy">caterer requirements</Link>.
        Approval means agreeing to them.
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Submitting...' : 'Submit application'}
        </button>
      </div>
    </div>
  );
}
