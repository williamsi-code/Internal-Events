'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminSpace } from '@/lib/admin';

const blank = (): AdminSpace => ({
  id: '',
  name: '',
  building: '',
  capacity_seated: null,
  capacity_standing: null,
  supports_catering: true,
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
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
          id: editing.id || null,
          name: editing.name.trim(),
          building: editing.building?.trim() || null,
          capacitySeated: editing.capacity_seated,
          capacityStanding: editing.capacity_standing,
          supportsCatering: editing.supports_catering,
          description: editing.description?.trim() || null,
          isActive: editing.is_active,
          sortOrder: editing.sort_order,
          facilityRateInternal: Number(editing.facility_rate_internal) || 0,
          facilityRateAffiliated: Number(editing.facility_rate_affiliated) || 0,
          facilityRateExternal: Number(editing.facility_rate_external) || 0,
          rateBasis: editing.rate_basis || 'per event',
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
    Number(v) === 0 ? 'No charge' : `$${Number(v).toFixed(2)}`;

  return (
    <>
      <div className="admin-bar">
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          Add a space
        </button>
        <span className="admin-note">
          Facility rates apply when Central provides no food. Internal is
          normally zero: a department using a room is not a transaction.
        </span>
      </div>

      {editing && (
        <div className="admin-editor">
          <h3>{editing.id ? 'Edit space' : 'New space'}</h3>
          {error && <div className="alert alert-error">{error}</div>}

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
              <label htmlFor="sp-seated">Seated capacity</label>
              <input
                id="sp-seated"
                type="number"
                min={0}
                value={editing.capacity_seated ?? ''}
                onChange={(e) =>
                  set({
                    capacity_seated: e.target.value ? Number(e.target.value) : null,
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
            <label htmlFor="sp-desc">Description</label>
            <p className="sub">Shown on the public event spaces page.</p>
            <textarea
              id="sp-desc"
              value={editing.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <h4 className="admin-h4">Facility rates</h4>
          <p className="sub" style={{ marginTop: '-.4rem' }}>
            Charged when an outside caterer or donated food replaces Central
            Dining, so there is no menu to price. Which rate applies follows the
            event&rsquo;s classification.
          </p>
          <div className="price-grid">
            <div className="field">
              <label htmlFor="sp-rate-int">Internal</label>
              <p className="sub">Usually zero.</p>
              <input
                id="sp-rate-int"
                type="number"
                min={0}
                step="0.01"
                value={editing.facility_rate_internal}
                onChange={(e) =>
                  set({ facility_rate_internal: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sp-rate-aff">Affiliated</label>
              <p className="sub">Cost recovery.</p>
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
              <label htmlFor="sp-rate-ext">External</label>
              <p className="sub">Commercial.</p>
              <input
                id="sp-rate-ext"
                type="number"
                min={0}
                step="0.01"
                value={editing.facility_rate_external}
                onChange={(e) =>
                  set({ facility_rate_external: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sp-basis">Rate basis</label>
              <p className="sub">How the rate is applied.</p>
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

          <div className="grid two">
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
              <label className="chk-inline">
                <input
                  type="checkbox"
                  checked={editing.supports_catering}
                  onChange={(e) => set({ supports_catering: e.target.checked })}
                />
                Catering permitted in this space
              </label>
              <label className="chk-inline">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={(e) => set({ is_active: e.target.checked })}
                />
                Available for booking
              </label>
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving...' : 'Save space'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Space</th>
            <th className="num">Seated</th>
            <th className="num">Standing</th>
            <th className="num">Affiliated</th>
            <th className="num">External</th>
            <th className="num">Booked</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {spaces.map((s) => (
            <tr key={s.id} className={s.is_active ? '' : 'inactive'}>
              <td>
                <span className="admin-name">{s.name}</span>
                {s.building && <span className="admin-sub">{s.building}</span>}
                {!s.supports_catering && (
                  <span className="pill p-review">No catering</span>
                )}
                {!s.is_active && (
                  <span className="pill p-review">Not bookable</span>
                )}
              </td>
              <td className="num">{s.capacity_seated ?? '\u2014'}</td>
              <td className="num">{s.capacity_standing ?? '\u2014'}</td>
              <td className="num">{money(s.facility_rate_affiliated)}</td>
              <td className="num">{money(s.facility_rate_external)}</td>
              <td className="num">{s.events_booked}</td>
              <td className="num">
                <button className="edit-link" onClick={() => setEditing(s)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
