'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminMenuItem, AdminCategory } from '@/lib/admin';

const TIERS: [keyof Prices, string, string][] = [
  ['internal_non_revenue', 'Internal', 'Food and disposables at cost'],
  ['internal_revenue_generating', 'Internal, ticketed', 'Internal event collecting revenue'],
  ['affiliated_cost_recovery', 'Affiliated', 'Partnership cost recovery'],
  ['external_commercial', 'External', 'Commercial rate'],
];

interface Prices {
  internal_non_revenue: number;
  internal_revenue_generating: number;
  affiliated_cost_recovery: number;
  external_commercial: number;
}

const blank = (categoryId: string): AdminMenuItem => ({
  id: '',
  category_id: categoryId,
  category: '',
  name: '',
  description: '',
  unit: 'per person',
  minimum_quantity: null,
  allergen_notes: '',
  is_active: true,
  sort_order: 0,
  internal_price: '0',
  internal_revenue_price: '0',
  affiliated_price: '0',
  external_price: '0',
  times_ordered: 0,
});

export default function MenuEditor({
  items,
  categories,
}: {
  items: AdminMenuItem[];
  categories: AdminCategory[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminMenuItem | null>(null);
  const [prices, setPrices] = useState<Prices>({
    internal_non_revenue: 0,
    internal_revenue_generating: 0,
    affiliated_cost_recovery: 0,
    external_commercial: 0,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function open(item: AdminMenuItem) {
    setEditing(item);
    setPrices({
      internal_non_revenue: Number(item.internal_price ?? 0),
      internal_revenue_generating: Number(item.internal_revenue_price ?? 0),
      affiliated_cost_recovery: Number(item.affiliated_price ?? 0),
      external_commercial: Number(item.external_price ?? 0),
    });
    setError('');
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('Give the item a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'menuItem',
          id: editing.id || null,
          categoryId: editing.category_id,
          name: editing.name.trim(),
          description: editing.description?.trim() || null,
          unit: editing.unit.trim(),
          minimumQuantity: editing.minimum_quantity,
          allergenNotes: editing.allergen_notes?.trim() || null,
          isActive: editing.is_active,
          sortOrder: editing.sort_order,
          prices,
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

  const set = (patch: Partial<AdminMenuItem>) =>
    setEditing((e) => (e ? { ...e, ...patch } : e));

  const money = (v: string | null) =>
    v === null ? '\u2014' : `$${Number(v).toFixed(2)}`;

  const grouped = categories.map((c) => ({
    category: c,
    items: items.filter((i) => i.category_id === c.id),
  }));

  return (
    <>
      <div className="admin-bar">
        <button
          className="btn btn-primary"
          onClick={() => open(blank(categories[0]?.id ?? ''))}
        >
          Add an item
        </button>
        <span className="admin-note">
          Price changes take effect tomorrow. Events already quoted keep the
          price they were given.
        </span>
      </div>

      {editing && (
        <div className="admin-editor">
          <h3>{editing.id ? 'Edit item' : 'New item'}</h3>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="grid two">
            <div className="field">
              <label htmlFor="mi-name">Name</label>
              <input
                id="mi-name"
                type="text"
                value={editing.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="mi-cat">Category</label>
              <select
                id="mi-cat"
                value={editing.category_id}
                onChange={(e) => set({ category_id: e.target.value })}
              >
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="mi-desc">Description</label>
            <textarea
              id="mi-desc"
              value={editing.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <div className="grid two">
            <div className="field">
              <label htmlFor="mi-unit">Unit</label>
              <p className="sub">&ldquo;per person&rdquo;, &ldquo;per gallon&rdquo;, &ldquo;each&rdquo;.</p>
              <input
                id="mi-unit"
                type="text"
                value={editing.unit}
                onChange={(e) => set({ unit: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="mi-min">Minimum quantity</label>
              <input
                id="mi-min"
                type="number"
                min={0}
                value={editing.minimum_quantity ?? ''}
                onChange={(e) =>
                  set({
                    minimum_quantity: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="mi-allergen">Allergen notes</label>
            <input
              id="mi-allergen"
              type="text"
              value={editing.allergen_notes ?? ''}
              onChange={(e) => set({ allergen_notes: e.target.value })}
            />
          </div>

          <h4 className="admin-h4">Prices</h4>
          <div className="price-grid">
            {TIERS.map(([key, label, hint]) => (
              <div className="field" key={key}>
                <label htmlFor={`price-${key}`}>{label}</label>
                <p className="sub">{hint}</p>
                <input
                  id={`price-${key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={prices[key]}
                  onChange={(e) =>
                    setPrices({ ...prices, [key]: Number(e.target.value) || 0 })
                  }
                />
              </div>
            ))}
          </div>

          <div className="grid two">
            <div className="field">
              <label htmlFor="mi-sort">Sort order</label>
              <input
                id="mi-sort"
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
                  checked={editing.is_active}
                  onChange={(e) => set({ is_active: e.target.checked })}
                />
                Available to order
              </label>
              {editing.times_ordered > 0 && (
                <p className="sub">
                  Ordered {editing.times_ordered} time
                  {editing.times_ordered === 1 ? '' : 's'}. Unticking hides it
                  from new requests without affecting existing ones.
                </p>
              )}
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving...' : 'Save item'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {grouped.map(({ category, items: catItems }) => (
        <section key={category.id} className="admin-section">
          <h3 className="admin-h3">{category.name}</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Internal</th>
                <th className="num">Ticketed</th>
                <th className="num">Affiliated</th>
                <th className="num">External</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {catItems.map((i) => (
                <tr key={i.id} className={i.is_active ? '' : 'inactive'}>
                  <td>
                    <span className="admin-name">{i.name}</span>
                    <span className="admin-sub">
                      {i.unit}
                      {i.minimum_quantity && i.minimum_quantity > 1
                        ? ` \u00b7 min ${i.minimum_quantity}`
                        : ''}
                    </span>
                    {!i.is_active && (
                      <span className="pill p-review">Hidden</span>
                    )}
                  </td>
                  <td className="num">{money(i.internal_price)}</td>
                  <td className="num">{money(i.internal_revenue_price)}</td>
                  <td className="num">{money(i.affiliated_price)}</td>
                  <td className="num">{money(i.external_price)}</td>
                  <td className="num">
                    <button className="edit-link" onClick={() => open(i)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
