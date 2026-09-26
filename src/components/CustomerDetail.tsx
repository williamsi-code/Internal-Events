'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Customer, Contact, CustomerEvent } from '@/lib/customers';

const KINDS = [
  ['department', 'Central department'],
  ['student_org', 'Student organization'],
  ['affiliated', 'Affiliated: alumni, foundation, partner'],
  ['business', 'Outside business'],
  ['nonprofit', 'Nonprofit'],
  ['individual', 'Private individual'],
] as const;

export default function CustomerDetail({
  customer,
  contacts,
  events,
}: {
  customer: Customer | null;
  contacts: Contact[];
  events: CustomerEvent[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!customer);
  const [addingContact, setAddingContact] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    kind: customer?.kind ?? 'department',
    name: customer?.name ?? '',
    tradingName: customer?.trading_name ?? '',
    billingAddress: customer?.billing_address ?? '',
    billingEmail: customer?.billing_email ?? '',
    billingAccount: customer?.billing_account ?? '',
    taxExempt: customer?.tax_exempt ?? false,
    taxExemptRef: customer?.tax_exempt_ref ?? '',
    notes: customer?.notes ?? '',
    dietaryNotes: customer?.dietary_notes ?? '',
    accessNotes: customer?.access_notes ?? '',
  });

  const [c, setC] = useState({
    fullName: '',
    role: '',
    email: '',
    phone: '',
    isPrimary: contacts.length === 0,
    notes: '',
  });

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  const money = (v: string) =>
    Number(v).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  async function save() {
    if (!f.name.trim()) {
      setError('Give them a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          id: customer?.id ?? null,
          kind: f.kind,
          name: f.name.trim(),
          tradingName: f.tradingName.trim() || null,
          billingAddress: f.billingAddress.trim() || null,
          billingEmail: f.billingEmail.trim() || null,
          billingAccount: f.billingAccount.trim() || null,
          taxExempt: f.taxExempt,
          taxExemptRef: f.taxExemptRef.trim() || null,
          notes: f.notes.trim() || null,
          dietaryNotes: f.dietaryNotes.trim() || null,
          accessNotes: f.accessNotes.trim() || null,
          isActive: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      if (!customer) {
        router.push(`/staff/manage/customers/${d.id}`);
        return;
      }
      setEditing(false);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  async function saveContact() {
    if (!c.fullName.trim()) {
      setError('The contact needs a name.');
      return;
    }
    setBusy(true);
    try {
      await fetch('/api/staff/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'contact',
          id: null,
          customerId: customer!.id,
          fullName: c.fullName.trim(),
          role: c.role.trim() || null,
          email: c.email.trim() || null,
          phone: c.phone.trim() || null,
          isPrimary: c.isPrimary,
          notes: c.notes.trim() || null,
        }),
      });
      setC({
        fullName: '', role: '', email: '', phone: '',
        isPrimary: false, notes: '',
      });
      setAddingContact(false);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {customer && !editing && (
        <>
          <div className="cap-facts">
            <div className="cap-fact">
              <span className="cap-n">{customer.events}</span>
              <span className="cap-l">events</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{money(customer.lifetime_value)}</span>
              <span className="cap-l">over the years</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{money(customer.value_this_year)}</span>
              <span className="cap-l">this year</span>
            </div>
            {customer.cancellations > 0 && (
              <div className="cap-fact warn">
                <span className="cap-n">{customer.cancellations}</span>
                <span className="cap-l">cancelled</span>
              </div>
            )}
          </div>

          {(customer.dietary_notes || customer.access_notes) && (
            <div className="callout c-default">
              <strong>Worth knowing before you ring them</strong>
              {customer.dietary_notes && <>{customer.dietary_notes} </>}
              {customer.access_notes}
            </div>
          )}

          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit their details
            </button>
          </div>
        </>
      )}

      {editing && (
        <div className="admin-editor">
          <h3>{customer ? 'Their details' : 'New customer'}</h3>

          <div className="grid two">
            <div className="field">
              <label htmlFor="cu-name">Name</label>
              <input
                id="cu-name"
                type="text"
                value={f.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cu-kind">What they are</label>
              <select
                id="cu-kind"
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
          </div>

          <h4 className="admin-h4">Billing</h4>
          <div className="grid two">
            <div className="field">
              <label htmlFor="cu-bemail">Invoices go to</label>
              <input
                id="cu-bemail"
                type="email"
                value={f.billingEmail}
                onChange={(e) => set({ billingEmail: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cu-acct">Account or PO reference</label>
              <input
                id="cu-acct"
                type="text"
                value={f.billingAccount}
                onChange={(e) => set({ billingAccount: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="cu-addr">Billing address</label>
            <textarea
              id="cu-addr"
              rows={3}
              value={f.billingAddress}
              onChange={(e) => set({ billingAddress: e.target.value })}
            />
          </div>
          <label className="chk-inline">
            <input
              type="checkbox"
              checked={f.taxExempt}
              onChange={(e) => set({ taxExempt: e.target.checked })}
            />
            Tax exempt
          </label>
          {f.taxExempt && (
            <div className="field" style={{ marginTop: '.5rem' }}>
              <label htmlFor="cu-taxref">Exemption reference</label>
              <input
                id="cu-taxref"
                type="text"
                value={f.taxExemptRef}
                onChange={(e) => set({ taxExemptRef: e.target.value })}
              />
            </div>
          )}

          <h4 className="admin-h4">What to remember</h4>
          <div className="field">
            <label htmlFor="cu-diet">Dietary</label>
            <p className="sub">
              What they always need. Saves asking every time, and saves getting
              it wrong once.
            </p>
            <textarea
              id="cu-diet"
              rows={2}
              value={f.dietaryNotes}
              onChange={(e) => set({ dietaryNotes: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cu-access">Access and delivery</label>
            <p className="sub">
              Which door, which lift, where to park, who has the key.
            </p>
            <textarea
              id="cu-access"
              rows={2}
              value={f.accessNotes}
              onChange={(e) => set({ accessNotes: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cu-notes">Anything else</label>
            <textarea
              id="cu-notes"
              rows={3}
              value={f.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving...' : customer ? 'Save' : 'Create the customer'}
            </button>
            {customer && (
              <button
                className="btn btn-ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {customer && (
        <>
          <section style={{ marginTop: '2rem' }}>
            <h2 className="bo-heading">People</h2>
            {contacts.length > 0 && (
              <div className="contact-list">
                {contacts.map((ct) => (
                  <div className="contact-row" key={ct.id}>
                    <div>
                      <span className="contact-name">
                        {ct.full_name}
                        {ct.is_primary && (
                          <span className="pill p-classified">Main contact</span>
                        )}
                        {ct.has_account && (
                          <span className="pill p-type">Has an account</span>
                        )}
                      </span>
                      <span className="contact-meta">
                        {ct.role ? `${ct.role} \u00b7 ` : ''}
                        {ct.email}
                        {ct.phone ? ` \u00b7 ${ct.phone}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {addingContact ? (
              <div className="admin-editor">
                <div className="grid two">
                  <div className="field">
                    <label htmlFor="ct-name">Name</label>
                    <input
                      id="ct-name"
                      type="text"
                      value={c.fullName}
                      onChange={(e) => setC({ ...c, fullName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ct-role">Role</label>
                    <input
                      id="ct-role"
                      type="text"
                      value={c.role}
                      onChange={(e) => setC({ ...c, role: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ct-email">Email</label>
                    <input
                      id="ct-email"
                      type="email"
                      value={c.email}
                      onChange={(e) => setC({ ...c, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ct-phone">Phone</label>
                    <input
                      id="ct-phone"
                      type="text"
                      value={c.phone}
                      onChange={(e) => setC({ ...c, phone: e.target.value })}
                    />
                  </div>
                </div>
                <label className="chk-inline">
                  <input
                    type="checkbox"
                    checked={c.isPrimary}
                    onChange={(e) =>
                      setC({ ...c, isPrimary: e.target.checked })
                    }
                  />
                  Main contact
                </label>
                <div className="actions">
                  <button
                    className="btn btn-primary"
                    onClick={saveContact}
                    disabled={busy}
                  >
                    Add them
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setAddingContact(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => setAddingContact(true)}
                >
                  Add someone
                </button>
              </div>
            )}
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2 className="bo-heading">Their events</h2>
            {events.length === 0 ? (
              <p className="empty">Nothing yet.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th className="num">Guests</th>
                    <th className="num">Charged</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className={e.is_past ? 'inactive' : ''}>
                      <td>
                        <Link href={`/staff/${e.id}`} className="room-link">
                          {e.event_name}
                        </Link>
                        <span className="admin-sub">
                          {e.event_date}
                          {e.space_name ? ` \u00b7 ${e.space_name}` : ''}
                          {' \u00b7 '}
                          {e.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="num">{e.attendance}</td>
                      <td className="num">{money(e.charged)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
