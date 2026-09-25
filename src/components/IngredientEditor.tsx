'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StockItem, SupplierOption } from '@/lib/inventory';
import type { UnitOption } from '@/lib/recipes';

/**
 * Setting up what is tracked.
 *
 * Most ingredients arrive here by being typed into a recipe, with
 * nothing but a name and a unit. This is where they get a par level,
 * a supplier and a price - which is what turns a list of names into
 * a shopping list.
 *
 * Par level zero means "we do not track this", which is the right
 * answer for most of them. Tracking everything is how a stocktake
 * becomes a two-hour job nobody does.
 */

const STORAGE = [
  ['dry', 'Dry store'],
  ['refrigerated', 'Walk-in'],
  ['frozen', 'Freezer'],
  ['chemical', 'Chemicals'],
  ['equipment', 'Equipment'],
] as const;

const ALLERGENS = [
  'milk', 'eggs', 'fish', 'shellfish', 'tree nuts',
  'peanuts', 'wheat', 'soy', 'sesame',
];

const blank = () => ({
  id: null as string | null,
  name: '',
  category: '',
  storage: 'dry' as (typeof STORAGE)[number][0],
  baseUnit: 'g',
  purchaseUnit: '',
  purchaseSize: '',
  parLevel: '0',
  reorderTo: '',
  lastCost: '',
  supplierId: '',
  allergens: [] as string[],
  isActive: true,
  notes: '',
});

export default function IngredientEditor({
  items,
  suppliers,
  units,
  categories,
}: {
  items: StockItem[];
  suppliers: SupplierOption[];
  units: UnitOption[];
  categories: { category: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ReturnType<typeof blank> | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('untracked');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const counts = useMemo(
    () => ({
      untracked: items.filter((i) => Number(i.par_level) === 0).length,
      tracked: items.filter((i) => Number(i.par_level) > 0).length,
      nocost: items.filter((i) => !i.last_cost).length,
      all: items.length,
    }),
    [items]
  );

  const shown = items.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (filter === 'untracked') return Number(i.par_level) === 0;
    if (filter === 'tracked') return Number(i.par_level) > 0;
    if (filter === 'nocost') return !i.last_cost;
    return true;
  });

  function open(item: StockItem) {
    setEditing({
      id: item.id,
      name: item.name,
      category: item.category ?? '',
      storage: item.storage as (typeof STORAGE)[number][0],
      baseUnit: item.base_unit,
      purchaseUnit: '',
      purchaseSize: '',
      parLevel: String(Number(item.par_level)),
      reorderTo: item.reorder_to ? String(Number(item.reorder_to)) : '',
      lastCost: item.last_cost ? String(Number(item.last_cost)) : '',
      supplierId: '',
      allergens: item.allergens ?? [],
      isActive: true,
      notes: '',
    });
    setError('');
  }

  const set = (patch: Partial<ReturnType<typeof blank>>) =>
    setEditing((e) => (e ? { ...e, ...patch } : e));

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('Give it a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ingredient',
          id: editing.id,
          name: editing.name.trim(),
          category: editing.category.trim() || null,
          storage: editing.storage,
          baseUnit: editing.baseUnit,
          purchaseUnit: editing.purchaseUnit || null,
          purchaseSize: Number(editing.purchaseSize) || null,
          parLevel: Number(editing.parLevel) || 0,
          reorderTo: Number(editing.reorderTo) || null,
          lastCost: Number(editing.lastCost) || null,
          supplierId: editing.supplierId || null,
          allergens: editing.allergens,
          isActive: editing.isActive,
          notes: editing.notes.trim() || null,
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

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="callout c-default">
        <strong>Par level zero means this is not tracked</strong>
        That is the right answer for most things. Track what running out of
        would ruin a Saturday, and leave the rest alone &mdash; a stocktake of
        four hundred items is one nobody does.
      </div>

      <div className="admin-bar">
        <button className="btn btn-primary" onClick={() => setEditing(blank())}>
          Add an item
        </button>
        <input
          type="search"
          placeholder="Find an item"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '13rem' }}
          aria-label="Find an item"
        />
      </div>

      <div className="filters" role="group" aria-label="Filter items">
        {(
          [
            ['untracked', 'Not tracked'],
            ['tracked', 'Tracked'],
            ['nocost', 'No price'],
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

      {editing && (
        <div className="admin-editor">
          <h3>{editing.id ? editing.name : 'New item'}</h3>

          <div className="grid two">
            <div className="field">
              <label htmlFor="ig-name">Name</label>
              <input
                id="ig-name"
                type="text"
                value={editing.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ig-cat">Category</label>
              <input
                id="ig-cat"
                type="text"
                list="ing-categories"
                placeholder="Produce, dairy, dry goods"
                value={editing.category}
                onChange={(e) => set({ category: e.target.value })}
              />
              <datalist id="ing-categories">
                {categories.map((c) => (
                  <option value={c.category} key={c.category} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="ig-storage">Where it lives</label>
              <p className="sub">Groups it on the stocktake sheet.</p>
              <select
                id="ig-storage"
                value={editing.storage}
                onChange={(e) =>
                  set({ storage: e.target.value as typeof editing.storage })
                }
              >
                {STORAGE.map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ig-unit">Counted in</label>
              <p className="sub">
                Everything about this item is measured in this unit. Changing
                it later does not convert what is already recorded.
              </p>
              <select
                id="ig-unit"
                value={editing.baseUnit}
                onChange={(e) => set({ baseUnit: e.target.value })}
              >
                {units.map((u) => (
                  <option value={u.code} key={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h4 className="admin-h4">Tracking</h4>
          <div className="grid two">
            <div className="field">
              <label htmlFor="ig-par">Par level</label>
              <p className="sub">
                Below this and it goes on the shopping list. Zero means do not
                track it.
              </p>
              <input
                id="ig-par"
                type="number"
                min={0}
                step="0.1"
                value={editing.parLevel}
                onChange={(e) => set({ parLevel: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ig-reorder">Top up to</label>
              <p className="sub">
                Leave blank to order back to par. Set higher if it comes in
                cases.
              </p>
              <input
                id="ig-reorder"
                type="number"
                min={0}
                step="0.1"
                value={editing.reorderTo}
                onChange={(e) => set({ reorderTo: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ig-cost">Cost per {editing.baseUnit}</label>
              <p className="sub">
                What costs a recipe. Updated automatically when a delivery is
                recorded.
              </p>
              <input
                id="ig-cost"
                type="number"
                min={0}
                step="0.0001"
                value={editing.lastCost}
                onChange={(e) => set({ lastCost: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ig-supplier">Supplier</label>
              <select
                id="ig-supplier"
                value={editing.supplierId}
                onChange={(e) => set({ supplierId: e.target.value })}
              >
                <option value="">Not set</option>
                {suppliers.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h4 className="admin-h4">Allergens</h4>
          <p className="sub" style={{ marginTop: '-.4rem' }}>
            These carry through every recipe this appears in, which is how a
            dish gets labelled without anyone remembering to.
          </p>
          <div className="allergen-picker">
            {ALLERGENS.map((a) => (
              <label
                className={`allergen${
                  editing.allergens.includes(a) ? ' picked' : ''
                }`}
                key={a}
              >
                <input
                  type="checkbox"
                  checked={editing.allergens.includes(a)}
                  onChange={() =>
                    set({
                      allergens: editing.allergens.includes(a)
                        ? editing.allergens.filter((x) => x !== a)
                        : [...editing.allergens, a],
                    })
                  }
                />
                {a}
              </label>
            ))}
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
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
            <th>Item</th>
            <th className="num">On hand</th>
            <th className="num">Par</th>
            <th className="num">Cost</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i.id}>
              <td>
                <span className="admin-name">{i.name}</span>
                <span className="admin-sub">
                  {i.category ? `${i.category} \u00b7 ` : ''}
                  {i.storage}
                  {i.supplier_name ? ` \u00b7 ${i.supplier_name}` : ''}
                </span>
                {(i.allergens?.length ?? 0) > 0 && (
                  <span className="admin-sub">
                    Allergens: {i.allergens.join(', ')}
                  </span>
                )}
              </td>
              <td className="num">
                {Number(i.on_hand)} {i.base_unit}
              </td>
              <td className="num">
                {Number(i.par_level) === 0 ? (
                  <span className="muted-cell">not tracked</span>
                ) : (
                  Number(i.par_level)
                )}
              </td>
              <td className="num">
                {i.last_cost ? (
                  `$${Number(i.last_cost).toFixed(4)}`
                ) : (
                  <span className="muted-cell">&mdash;</span>
                )}
              </td>
              <td className="num">
                <button className="edit-link" onClick={() => open(i)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {shown.length === 0 && (
        <p className="empty" style={{ padding: '1.5rem 0' }}>
          {items.length === 0
            ? 'No items yet. They appear here as recipes are written.'
            : 'Nothing matches.'}
        </p>
      )}
    </>
  );
}
