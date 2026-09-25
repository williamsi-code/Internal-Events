'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StockItem } from '@/lib/inventory';

/**
 * Walking the shelves.
 *
 * The whole inventory system rests on this screen being quick enough
 * that someone does it. So: one row per item, one box, tab moves
 * down the list, and a blank box means "not counted" rather than
 * "none left".
 *
 * Grouped by where things are stored, because that is the order
 * someone walks in.
 */

const STORAGE_LABEL: Record<string, string> = {
  dry: 'Dry store',
  refrigerated: 'Walk-in',
  frozen: 'Freezer',
  chemical: 'Chemicals',
  equipment: 'Equipment',
};

export default function StockCount({ items }: { items: StockItem[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const shown = items.filter(
    (i) =>
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const byStorage = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const i of shown) {
      if (!map.has(i.storage)) map.set(i.storage, []);
      map.get(i.storage)!.push(i);
    }
    return [...map.entries()];
  }, [shown]);

  const entered = Object.values(counts).filter((v) => v !== '').length;

  // What the count says against what the system thought, before
  // anything is saved. Seeing it beforehand catches a typo.
  const differences = useMemo(() => {
    let n = 0;
    for (const [id, value] of Object.entries(counts)) {
      if (value === '') continue;
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      if (Math.abs(Number(value) - Number(item.on_hand)) > 0.001) n++;
    }
    return n;
  }, [counts, items]);

  async function save() {
    const payload = Object.entries(counts)
      .filter(([, v]) => v !== '')
      .map(([ingredientId, v]) => ({
        ingredientId,
        onHand: Number(v),
      }));

    if (payload.length === 0) {
      setError('Nothing counted yet.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'count',
          counts: payload,
          note: note.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setDone(payload.length);
      setCounts({});
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <>
      {done !== null && (
        <div className="callout c-default">
          <strong>
            {done} item{done === 1 ? '' : 's'} counted
          </strong>
          The shopping list has been brought up to date.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-bar">
        <input
          type="search"
          placeholder="Find an item"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '14rem' }}
          aria-label="Find an item"
        />
        <span className="admin-note">
          Leave a box blank for anything you did not count. Blank is not zero.
        </span>
      </div>

      {byStorage.map(([storage, list]) => (
        <section className="count-group" key={storage}>
          <h2 className="bo-heading">
            {STORAGE_LABEL[storage] ?? storage}
            <span className="count-group-n">{list.length}</span>
          </h2>

          <div className="count-rows">
            {list.map((i) => {
              const value = counts[i.id] ?? '';
              const differs =
                value !== '' &&
                Math.abs(Number(value) - Number(i.on_hand)) > 0.001;

              return (
                <div
                  className={`count-row${differs ? ' differs' : ''}${
                    i.below_par ? ' low' : ''
                  }`}
                  key={i.id}
                >
                  <div className="count-name">
                    <span className="count-item">{i.name}</span>
                    <span className="count-meta">
                      {i.category ? `${i.category} \u00b7 ` : ''}
                      showing {Number(i.on_hand).toFixed(
                        Number(i.on_hand) % 1 === 0 ? 0 : 2
                      )}{' '}
                      {i.base_unit}
                      {Number(i.par_level) > 0
                        ? ` \u00b7 par ${Number(i.par_level)}`
                        : ''}
                      {i.last_counted ? ` \u00b7 counted ${i.last_counted}` : ''}
                    </span>
                  </div>

                  <div className="count-entry">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={value}
                      placeholder="—"
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [i.id]: e.target.value }))
                      }
                      aria-label={`Count of ${i.name} in ${i.base_unit}`}
                    />
                    <span className="count-unit">{i.base_unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="count-save">
        <div className="field" style={{ marginBottom: '.7rem' }}>
          <label htmlFor="ct-note">Note for this count</label>
          <input
            id="ct-note"
            type="text"
            placeholder="Monday morning walk-through"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving...' : `Save ${entered} count${entered === 1 ? '' : 's'}`}
          </button>
          {entered > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => setCounts({})}
              disabled={busy}
            >
              Clear
            </button>
          )}
          {differences > 0 && (
            <span className="count-diff">
              {differences} differ{differences === 1 ? 's' : ''} from what we
              were showing
            </span>
          )}
        </div>
      </div>
    </>
  );
}
