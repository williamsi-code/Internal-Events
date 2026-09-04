'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Person, RoleChange } from '@/lib/users';

const ROLES: [string, string, string][] = [
  [
    'events_staff',
    'Events staff',
    'Queue, schedule, classification decisions, capacity checks, back office',
  ],
  [
    'schedule_viewer',
    'Schedule only',
    'Sees the room schedule and nothing else. For security, facilities and anyone who needs to know what is happening in the buildings',
  ],
  [
    'service_approver',
    'Service approver',
    'Sign-off for dining, facilities, campus safety or risk',
  ],
  ['admin', 'Administrator', 'Everything, plus granting access to others'],
];

export default function PeopleEditor({
  people,
  history,
  currentUserId,
  isAdmin,
}: {
  people: Person[];
  history: RoleChange[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState('staff');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const isStaffAccount = (p: Person) =>
    p.roles.includes('events_staff') ||
    p.roles.includes('admin') ||
    p.roles.includes('service_approver');

  const isViewer = (p: Person) =>
    p.roles.includes('schedule_viewer') && !isStaffAccount(p);

  const shown = people.filter((p) => {
    if (filter === 'staff') return isStaffAccount(p);
    if (filter === 'viewers') return isViewer(p);
    if (filter === 'customers') return !isStaffAccount(p) && !isViewer(p);
    if (filter === 'inactive') return !p.is_active;
    return true;
  });

  async function change(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError('');
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy('');
        return;
      }
      router.refresh();
      setBusy('');
    } catch {
      setError('Could not reach the server.');
      setBusy('');
    }
  }

  const counts = {
    staff: people.filter(isStaffAccount).length,
    viewers: people.filter(isViewer).length,
    customers: people.filter((p) => !isStaffAccount(p) && !isViewer(p)).length,
    inactive: people.filter((p) => !p.is_active).length,
    all: people.length,
  };

  return (
    <>
      {!isAdmin && (
        <div className="callout c-warn">
          <strong>You can see this list but not change it</strong>
          Only an administrator can grant or remove access.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters" role="group" aria-label="Filter accounts">
        {(
          [
            ['staff', 'Staff'],
            ['viewers', 'Schedule only'],
            ['customers', 'Customers'],
            ['inactive', 'Deactivated'],
            ['all', 'Everyone'],
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

      <table className="admin-table people-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Access</th>
            <th className="num">Activity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} className={p.is_active ? '' : 'inactive'}>
              <td>
                <span className="admin-name">
                  {p.full_name}
                  {p.id === currentUserId && (
                    <span className="you-badge">you</span>
                  )}
                </span>
                <span className="admin-sub">{p.email}</span>
                {p.department_org && (
                  <span className="admin-sub">{p.department_org}</span>
                )}
                <span className="people-flags">
                  {!p.is_central_domain && (
                    <span className="pill p-review">Outside address</span>
                  )}
                  {!p.email_verified && (
                    <span className="pill p-review">Email unverified</span>
                  )}
                  {!p.is_active && (
                    <span className="pill p-flag">Deactivated</span>
                  )}
                </span>
              </td>
              <td>
                <div className="role-toggles">
                  {ROLES.map(([role, label, hint]) => {
                    const has = p.roles.includes(role);
                    const key = `${p.id}-${role}`;
                    return (
                      <label className="role-toggle" key={role} title={hint}>
                        <input
                          type="checkbox"
                          checked={has}
                          disabled={!isAdmin || busy === key}
                          onChange={() =>
                            change({ userId: p.id, role, granted: !has }, key)
                          }
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
                {!p.roles.some((r) => r !== 'requester') && (
                  <span className="admin-sub">
                    Can submit and track their own events only
                  </span>
                )}
              </td>
              <td className="num">
                <span className="admin-sub">
                  {p.requests_made} request{p.requests_made === 1 ? '' : 's'}
                </span>
                {p.decisions_made > 0 && (
                  <span className="admin-sub">
                    {p.decisions_made} decision
                    {p.decisions_made === 1 ? '' : 's'}
                  </span>
                )}
                <span className="admin-sub">
                  {p.last_sign_in ? `Last in ${p.last_sign_in}` : 'Never signed in'}
                </span>
              </td>
              <td className="num">
                {isAdmin && p.id !== currentUserId && (
                  <button
                    className="edit-link"
                    disabled={busy === `${p.id}-active`}
                    onClick={() =>
                      change(
                        { userId: p.id, isActive: !p.is_active },
                        `${p.id}-active`
                      )
                    }
                  >
                    {p.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {history.length > 0 && (
        <section className="admin-section" style={{ marginTop: '2rem' }}>
          <h3 className="admin-h3">Recent access changes</h3>
          <ul className="role-history">
            {history.map((h, i) => (
              <li key={i}>
                <span>
                  <strong>{h.full_name}</strong>{' '}
                  {h.granted ? 'was given' : 'lost'}{' '}
                  {h.role.replace(/_/g, ' ')}
                </span>
                <span className="sub">
                  {h.changed_by_name} {'\u00b7'} {h.changed_at}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
