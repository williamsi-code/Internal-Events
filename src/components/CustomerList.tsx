'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CustomerSummary } from '@/lib/customers';

const KIND_LABEL: Record<string, string> = {
  department: 'Department',
  student_org: 'Student org',
  affiliated: 'Affiliated',
  business: 'Business',
  individual: 'Individual',
  nonprofit: 'Nonprofit',
};

export default function CustomerList({
  customers,
  unlinked,
}: {
  customers: CustomerSummary[];
  unlinked: {
    department_org: string;
    contact_email: string;
    requester_name: string;
    events: number;
    total: string;
    last_event: string;
  }[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(
    () => ({
      all: customers.filter((c) => c.is_active).length,
      repeat: customers.filter((c) => c.is_active && c.events > 1).length,
      upcoming: customers.filter((c) => c.next_event).length,
      unlinked: unlinked.length,
    }),
    [customers, unlinked]
  );

  const shown = customers.filter((c) => {
    if (!c.is_active) return false;
    if (
      search &&
      !`${c.name} ${c.primary_contact ?? ''} ${c.primary_email ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    if (filter === 'repeat') return c.events > 1;
    if (filter === 'upcoming') return !!c.next_event;
    return true;
  });

  const money = (v: string) =>
    Number(v).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  /** Make a customer from a group of past events and attach them all. */
  async function adopt(group: (typeof unlinked)[number]) {
    setBusy(group.contact_email);
    setError('');
    try {
      const made = await fetch('/api/staff/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          id: null,
          // A guess from the address, corrected on the customer's own
          // page. Better than making someone choose before they can
          // see the history.
          kind: group.contact_email.endsWith('@central.edu')
            ? 'department'
            : 'business',
          name: group.department_org || group.requester_name,
          tradingName: null,
          billingAddress: null,
          billingEmail: group.contact_email,
          billingAccount: null,
          taxExempt: false,
          taxExemptRef: null,
          notes: null,
          dietaryNotes: null,
          accessNotes: null,
          isActive: true,
        }),
      });
      const m = await made.json();
      if (!made.ok) {
        setError(m.error ?? 'Could not create them.');
        setBusy('');
        return;
      }

      await fetch('/api/staff/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'contact',
          id: null,
          customerId: m.id,
          fullName: group.requester_name,
          role: null,
          email: group.contact_email,
          phone: null,
          isPrimary: true,
          notes: null,
        }),
      });

      await fetch('/api/staff/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          customerId: m.id,
          departmentOrg: group.department_org,
          contactEmail: group.contact_email,
        }),
      });

      router.push(`/staff/manage/customers/${m.id}`);
    } catch {
      setError('Could not reach the server.');
      setBusy('');
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-bar">
        <Link href="/staff/manage/customers/new" className="btn btn-primary">
          Add a customer
        </Link>
        <input
          type="search"
          placeholder="Find a customer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '14rem' }}
          aria-label="Find a customer"
        />
      </div>

      <div className="filters" role="group" aria-label="Filter">
        {(
          [
            ['all', 'Everyone'],
            ['repeat', 'Repeat customers'],
            ['upcoming', 'Something booked'],
            ['unlinked', 'Not yet a customer'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label} <span className="n">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filter === 'unlinked' ? (
        <>
          <div className="callout c-default">
            <strong>Past events with nobody attached</strong>
            Grouped by how they signed. Adopting one creates the customer and
            attaches every event that signed the same way, which is how the
            history becomes useful rather than merely stored.
          </div>

          {unlinked.length === 0 ? (
            <p className="empty" style={{ padding: '2rem 0' }}>
              Every event belongs to a customer.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Signed as</th>
                  <th className="num">Events</th>
                  <th className="num">Worth</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {unlinked.map((u) => (
                  <tr key={u.contact_email + u.department_org}>
                    <td>
                      <span className="admin-name">
                        {u.department_org || u.requester_name}
                      </span>
                      <span className="admin-sub">
                        {u.requester_name} {'\u00b7'} {u.contact_email}
                      </span>
                      <span className="admin-sub">
                        Last event {u.last_event}
                      </span>
                    </td>
                    <td className="num">{u.events}</td>
                    <td className="num">{money(u.total)}</td>
                    <td className="num">
                      <button
                        className="edit-link"
                        disabled={busy === u.contact_email}
                        onClick={() => adopt(u)}
                      >
                        {busy === u.contact_email
                          ? 'Creating...'
                          : 'Make a customer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : shown.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          {customers.length === 0
            ? 'No customers yet. Start from the past events under "Not yet a customer".'
            : 'Nothing matches.'}
        </p>
      ) : (
        <div className="customer-list">
          {shown.map((c) => (
            <Link
              href={`/staff/manage/customers/${c.id}`}
              className="customer-row"
              key={c.id}
            >
              <div className="customer-main">
                <span className="customer-name">
                  {c.name}
                  <span className="customer-kind">
                    {KIND_LABEL[c.kind] ?? c.kind}
                  </span>
                </span>
                <span className="customer-meta">
                  {c.primary_contact}
                  {c.primary_email ? ` \u00b7 ${c.primary_email}` : ''}
                </span>
                {c.next_event && (
                  <span className="customer-next">
                    Next event {c.next_event}
                  </span>
                )}
              </div>
              <div className="customer-figures">
                <span className="customer-value">
                  {money(c.lifetime_value)}
                </span>
                <span className="customer-events">
                  {c.events} event{c.events === 1 ? '' : 's'}
                  {c.events_this_year > 0
                    ? ` \u00b7 ${c.events_this_year} this year`
                    : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
