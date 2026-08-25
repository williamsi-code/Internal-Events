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

  return (
    <>
      <div className="admin-bar">
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          Add a space
        </button>
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
            <th>Catering</th>
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
                {!s.is_active && (
                  <span className="pill p-review">Not bookable</span>
                )}
              </td>
              <td className="num">{s.capacity_seated ?? '\u2014'}</td>
              <td className="num">{s.capacity_standing ?? '\u2014'}</td>
              <td>{s.supports_catering ? 'Yes' : 'No'}</td>
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
