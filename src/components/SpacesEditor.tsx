'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdminSpace } from '@/lib/admin';

const blank = (): AdminSpace => ({
  id: '',
  name: '',
  building: '',
  campus: 'Central College',
  category: 'Meeting Venues',
  capacity_seated: null,
  capacity_standing: null,
  supports_catering: true,
  externally_bookable: false,
  description: '',
  is_active: true,
  sort_order: 0,
  events_booked: 0,
  facility_rate_internal: '0',
  facility_rate_affiliated: '0',
  facility_rate_external: '0',
  rate_basis: 'per event',
});

export default function SpacesEditor({ spaces }: { spaces: AdminSpace[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminSpace | null>(null);
  const [filter, setFilter] = useState('external');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const counts = useMemo(
    () => ({
      external: spaces.filter((s) => s.is_active && s.externally_bookable).length,
      internal: spaces.filter((s) => s.is_active && !s.externally_bookable).length,
      hidden: spaces.filter((s) => !s.is_active).length,
      all: spaces.length,
    }),
    [spaces]
  );

  const shown = spaces.filter((s) => {
    if (
      search &&
      !`${s.name} ${s.building ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    if (filter === 'external') return s.is_active && s.externally_bookable;
    if (filter === 'internal') return s.is_active && !s.externally_bookable;
    if (filter === 'hidden') return !s.is_active;
    return true;
  });

  async function save(space: AdminSpace) {
    if (!space.name.trim()) {
      setError('Give the space a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'space',
          id: space.id || null,
          name: space.name.trim(),
          building: space.building?.trim() || null,
          category: space.category?.trim() || null,
          capacitySeated: space.capacity_seated,
          capacityStanding: space.capacity_standing,
          supportsCatering: space.supports_catering,
          externallyBookable: space.externally_bookable,
          description: space.description?.trim() || null,
          isActive: space.is_active,
          sortOrder: space.sort_order,
          facilityRateInternal: Number(space.facility_rate_internal) || 0,
          facilityRateAffiliated: Number(space.facility_rate_affiliated) || 0,
          facilityRateExternal: Number(space.facility_rate_external) || 0,
          rateBasis: space.rate_basis || 'per event',
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setEditing(null);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const set = (patch: Partial<AdminSpace>) =>
    setEditing((e) => (e ? { ...e, ...patch } : e));

  const money = (v: string) =>
    Number(v) === 0 ? '\u2014' : `$${Number(v).toFixed(0)}`;

  return (
    <>
      <div className="callout c-default">
        <strong>Two audiences, two lists</strong>
        Outside customers see only the spaces marked bookable externally, both
        on the public spaces page and in the ordering form. Central departments
        can book anything active.
      </div>

      <div className="admin-bar">
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          Add a space
        </button>
        <input
          type="search"
          placeholder="Find a room"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '12rem' }}
          aria-label="Find a room"
        />
      </div>

      <div className="filters" role="group" aria-label="Filter spaces">
        {(
          [
            ['external', 'Outside customers see'],
            ['internal', 'Internal only'],
            ['hidden', 'Not bookable'],
            ['all', 'Everything'],
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

      {error && <div className="alert alert-error">{error}</div>}

      {editing && (
        <div className="admin-editor">
          <h3>{editing.id ? 'Edit space' : 'New space'}</h3>

          <div className="grid two">
            <div className="field">
              <label htmlFor="sp-name">Name</label>
              <input
                id="sp-name"
                type="text"
                value={editing.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-building">Building</label>
              <input
                id="sp-building"
                type="text"
                value={editing.building ?? ''}
                onChange={(e) => set({ building: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-cat">Category</label>
              <select
                id="sp-cat"
                value={editing.category ?? ''}
                onChange={(e) => set({ category: e.target.value })}
              >
                <option value="Meeting Venues">Meeting Venues</option>
                <option value="Outside Spaces">Outside Spaces</option>
                <option value="Academic">Academic</option>
                <option value="Athletics">Athletics</option>
                <option value="Housing">Housing</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sp-sort">Sort order</label>
              <input
                id="sp-sort"
                type="number"
                min={0}
                value={editing.sort_order}
                onChange={(e) => set({ sort_order: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-seated">Seated capacity</label>
              <input
                id="sp-seated"
                type="number"
                min={0}
                value={editing.capacity_seated ?? ''}
                onChange={(e) =>
                  set({
                    capacity_seated: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sp-standing">Standing capacity</label>
              <input
                id="sp-standing"
                type="number"
                min={0}
                value={editing.capacity_standing ?? ''}
                onChange={(e) =>
                  set({
                    capacity_standing: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="sp-desc">Short description</label>
            <p className="sub">
              A line for the spaces list. The fuller page content is edited
              separately.
            </p>
            <textarea
              id="sp-desc"
              value={editing.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <h4 className="admin-h4">Who can book it</h4>
          <label className="chk-inline">
            <input
              type="checkbox"
              checked={editing.externally_bookable}
              onChange={(e) => set({ externally_bookable: e.target.checked })}
            />
            Outside customers can see and book this space
          </label>
          <p className="sub">
            Leave unticked for rooms only Central departments should use.
          </p>
          <label className="chk-inline" style={{ marginTop: '.6rem' }}>
            <input
              type="checkbox"
              checked={editing.supports_catering}
              onChange={(e) => set({ supports_catering: e.target.checked })}
            />
            Catering permitted in this space
          </label>
          <label className="chk-inline" style={{ marginTop: '.6rem' }}>
            <input
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) => set({ is_active: e.target.checked })}
            />
            Bookable at all
          </label>

          <h4 className="admin-h4">Facility rates</h4>
          <p className="sub" style={{ marginTop: '-.4rem' }}>
            Charged when an outside caterer or donated food replaces Central
            Catering, so there is no menu to price. Changing the external rate
            recalculates the other two at 60% and 30%.
          </p>
          <div className="price-grid">
            <div className="field">
              <label htmlFor="sp-rate-ext">External</label>
              <input
                id="sp-rate-ext"
                type="number"
                min={0}
                step="0.01"
                value={editing.facility_rate_external}
                onChange={(e) =>
                  set({
                    facility_rate_external: e.target.value,
                    facility_rate_affiliated: (
                      Number(e.target.value) * 0.6
                    ).toFixed(2),
                    facility_rate_internal: (
                      Number(e.target.value) * 0.3
                    ).toFixed(2),
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sp-rate-aff">Affiliated</label>
              <input
                id="sp-rate-aff"
                type="number"
                min={0}
                step="0.01"
                value={editing.facility_rate_affiliated}
                onChange={(e) =>
                  set({ facility_rate_affiliated: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sp-rate-int">Internal</label>
              <input
                id="sp-rate-int"
                type="number"
                min={0}
                step="0.01"
                value={editing.facility_rate_internal}
                onChange={(e) => set({ facility_rate_internal: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-basis">Rate basis</label>
              <select
                id="sp-basis"
                value={editing.rate_basis}
                onChange={(e) => set({ rate_basis: e.target.value })}
              >
                <option value="per event">Per event</option>
                <option value="per hour">Per hour</option>
                <option value="per day">Per day</option>
              </select>
            </div>
          </div>

          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => save(editing)}
              disabled={busy}
            >
              {busy ? 'Saving...' : 'Save space'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {editing.id && editing.externally_bookable && (
              <Link
                href={`/staff/manage/spaces/${editing.id}`}
                className="edit-link"
              >
                Edit the public page
              </Link>
            )}
          </div>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Space</th>
            <th className="num">Seated</th>
            <th className="num">External rate</th>
            <th className="num">Booked</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.id} className={s.is_active ? '' : 'inactive'}>
              <td>
                <span className="admin-name">{s.name}</span>
                {s.building && <span className="admin-sub">{s.building}</span>}
                <span className="people-flags">
                  {s.externally_bookable && (
                    <span className="pill p-classified">Public</span>
                  )}
                  {!s.supports_catering && (
                    <span className="pill p-review">No catering</span>
                  )}
                  {!s.is_active && (
                    <span className="pill p-flag">Not bookable</span>
                  )}
                </span>
              </td>
              <td className="num">{s.capacity_seated ?? '\u2014'}</td>
              <td className="num">{money(s.facility_rate_external)}</td>
              <td className="num">{s.events_booked}</td>
              <td className="num">
                <button className="edit-link" onClick={() => setEditing(s)}>
                  Edit
                </button>
                {s.externally_bookable && (
                  <>
                    {' '}
                    <Link
                      href={`/staff/manage/spaces/${s.id}`}
                      className="edit-link"
                    >
                      Page
                    </Link>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {shown.length === 0 && (
        <p className="empty" style={{ padding: '1.5rem 0' }}>
          Nothing matches.
        </p>
      )}
    </>
  );
}
