'use client';

import { useMemo, useState } from 'react';
import MenuChoices, { type ChoiceValue } from './MenuChoices';
import type { ChoiceGroup } from '@/lib/choices';

/**
 * Choosing a menu without reading a menu.
 *
 * A hundred and eighty items laid out in seventeen sections is a
 * document, not a form. Somebody ordering coffee and pastries for a
 * committee should find them in about ten seconds and never see the
 * rest.
 *
 * So: a search box, sections closed until opened, and a button that
 * fills the quantity with the guest count, which is what it almost
 * always is.
 */

export interface PickerItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unit_price: string;
  minimum_quantity: number | null;
}

export default function MenuPicker({
  menu,
  choiceGroups,
  quantities,
  choices,
  guests,
  onQuantity,
  onChoices,
}: {
  menu: PickerItem[];
  choiceGroups: Record<string, ChoiceGroup[]>;
  quantities: Record<string, number>;
  choices: Record<string, ChoiceValue[]>;
  /** What they said in the event section, used to fill quantities. */
  guests: number;
  onQuantity: (itemId: string, quantity: number) => void;
  onChoices: (itemId: string, values: ChoiceValue[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string[]>([]);

  const money = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const chosenIds = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([id]) => id);

  const searching = search.trim().length > 1;

  const matches = useMemo(() => {
    if (!searching) return [];
    const q = search.toLowerCase();
    return menu
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.description ?? '').toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [search, menu, searching]);

  const categories = useMemo(() => {
    const map = new Map<string, PickerItem[]>();
    for (const m of menu) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()];
  }, [menu]);

  const chosen = menu.filter((m) => chosenIds.includes(m.id));

  function toggleCategory(name: string) {
    setOpen((o) =>
      o.includes(name) ? o.filter((x) => x !== name) : [...o, name]
    );
  }

  /* ---------- one item's row ---------- */
  function Row({ m }: { m: PickerItem }) {
    const qty = quantities[m.id] ?? 0;
    const groups = choiceGroups[m.id] ?? [];
    const perPerson = m.unit.toLowerCase().includes('person');

    return (
      <div className={`pick-row${qty > 0 ? ' chosen' : ''}`}>
        <div className="pick-main">
          <span className="pick-name">{m.name}</span>
          {m.description && (
            <span className="pick-desc">{m.description}</span>
          )}
          <span className="pick-price">
            {money(Number(m.unit_price))} {m.unit}
            {m.minimum_quantity ? ` \u00b7 minimum ${m.minimum_quantity}` : ''}
          </span>
        </div>

        <div className="pick-actions">
          {qty > 0 ? (
            <div className="pick-qty">
              <button
                type="button"
                className="pick-step"
                onClick={() => onQuantity(m.id, Math.max(0, qty - 1))}
                aria-label={`One fewer ${m.name}`}
              >
                &minus;
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={qty}
                onChange={(e) => onQuantity(m.id, Number(e.target.value) || 0)}
                aria-label={`How many ${m.name}`}
              />
              <button
                type="button"
                className="pick-step"
                onClick={() => onQuantity(m.id, qty + 1)}
                aria-label={`One more ${m.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <div className="pick-add">
              {/* Almost every per-person item is ordered at the
                  headcount, so that is one button rather than
                  typing a number they already gave us. */}
              {perPerson && guests > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    onQuantity(m.id, Math.max(guests, m.minimum_quantity ?? 1))
                  }
                >
                  For all {guests}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onQuantity(m.id, m.minimum_quantity ?? 1)}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {qty > 0 && groups.length > 0 && (
          <MenuChoices
            groups={groups}
            values={choices[m.id] ?? []}
            orderedQuantity={qty}
            onChange={(next) => onChoices(m.id, next)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="menu-picker">
      <div className="field">
        <label htmlFor="mp-search" className="sr-only">
          Search the menu
        </label>
        <input
          id="mp-search"
          type="search"
          className="pick-search"
          placeholder="Search the menu — coffee, sandwiches, cake..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* What they have so far, always visible, so the order is not
          something they have to go hunting for. */}
      {chosen.length > 0 && (
        <div className="pick-basket">
          <h4>Your order so far</h4>
          {chosen.map((m) => (
            <Row m={m} key={m.id} />
          ))}
        </div>
      )}

      {searching ? (
        <div className="pick-results">
          {matches.length === 0 ? (
            <p className="empty">
              Nothing matches &ldquo;{search}&rdquo;. We can usually make
              things that are not on the menu &mdash; say so in the notes and
              we will come back to you.
            </p>
          ) : (
            matches
              .filter((m) => !chosenIds.includes(m.id))
              .map((m) => (
                <div className="pick-result" key={m.id}>
                  <span className="pick-cat">{m.category}</span>
                  <Row m={m} />
                </div>
              ))
          )}
        </div>
      ) : (
        <div className="pick-categories">
          {categories.map(([name, items]) => {
            const isOpen = open.includes(name);
            const inHere = items.filter((m) =>
              chosenIds.includes(m.id)
            ).length;

            return (
              <div
                className={`pick-cat-block${isOpen ? ' open' : ''}`}
                key={name}
              >
                <button
                  type="button"
                  className="pick-cat-head"
                  onClick={() => toggleCategory(name)}
                  aria-expanded={isOpen}
                >
                  <span className="pick-cat-name">{name}</span>
                  <span className="pick-cat-meta">
                    {inHere > 0 && (
                      <span className="pick-cat-count">{inHere} chosen</span>
                    )}
                    <span className="pick-cat-n">{items.length}</span>
                    <span className="pick-cat-arrow" aria-hidden="true">
                      {isOpen ? '\u2212' : '+'}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="pick-cat-items">
                    {items
                      .filter((m) => !chosenIds.includes(m.id))
                      .map((m) => (
                        <Row m={m} key={m.id} />
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
