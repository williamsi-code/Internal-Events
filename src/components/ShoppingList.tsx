'use client';

import { useMemo, useState } from 'react';
import type { ShoppingItem } from '@/lib/inventory';

/**
 * What to order.
 *
 * Grouped by supplier, because that is how an order is placed. The
 * ticks are for working through it, not stored: this is a list you
 * print or read off a phone in the store room.
 */

export default function ShoppingList({
  items,
  upcoming,
}: {
  items: ShoppingItem[];
  upcoming: {
    ingredient_id: string;
    ingredient_name: string;
    quantity: string;
    unit: string;
    short_by: string;
    events: number;
  }[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const bySupplier = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const i of items) {
      const key = i.supplier_name ?? 'No supplier set';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return [...map.entries()].sort((a, b) =>
      a[0] === 'No supplier set' ? 1 : b[0] === 'No supplier set' ? -1 : 0
    );
  }, [items]);

  const total = items.reduce((s, i) => s + Number(i.estimated_cost), 0);

  const money = (v: string | number) =>
    Number(v).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });

  function toggle(id: string) {
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {upcoming.length > 0 && (
        <div className="callout c-warn no-print">
          <strong>
            {upcoming.length} item{upcoming.length === 1 ? '' : 's'} short for
            events in the next fortnight
          </strong>
          These are worked out from recipes, so they only cover menu items that
          have one:{' '}
          {upcoming
            .slice(0, 6)
            .map((u) => `${u.ingredient_name} (${Number(u.short_by)} ${u.unit})`)
            .join(', ')}
          {upcoming.length > 6 ? ', and others' : ''}.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card">
          <h2>Nothing below par</h2>
          <p className="hint">
            Either the store is full or nobody has counted lately. Par levels
            are set against each item in the stock list.
          </p>
        </div>
      ) : (
        <>
          <div className="shop-head no-print">
            <span>
              {items.length} item{items.length === 1 ? '' : 's'} to order
            </span>
            <span className="shop-total">
              about {money(total)}
            </span>
          </div>

          {bySupplier.map(([supplier, list]) => (
            <section className="shop-group" key={supplier}>
              <h2 className="bo-heading">
                {supplier}
                <span className="count-group-n">{list.length}</span>
              </h2>

              <table className="shop-table">
                <thead>
                  <tr>
                    <th className="no-print"></th>
                    <th>Item</th>
                    <th className="num">Have</th>
                    <th className="num">Order</th>
                    <th className="num">About</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr
                      key={i.id}
                      className={ticked.has(i.id) ? 'ticked' : ''}
                    >
                      <td className="no-print">
                        <input
                          type="checkbox"
                          checked={ticked.has(i.id)}
                          onChange={() => toggle(i.id)}
                          aria-label={`Got ${i.name}`}
                        />
                      </td>
                      <td>
                        <span className="admin-name">{i.name}</span>
                        {i.category && (
                          <span className="admin-sub">{i.category}</span>
                        )}
                      </td>
                      <td className="num">
                        {Number(i.on_hand)} {i.base_unit}
                      </td>
                      <td className="num strong">
                        {Number(i.suggested_order)} {i.base_unit}
                      </td>
                      <td className="num">
                        {Number(i.estimated_cost) > 0
                          ? money(i.estimated_cost)
                          : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <p className="sub no-print">
            Quantities are what it takes to reach par, rounded to the item's
            own unit. Order in whatever the supplier sells.
          </p>
        </>
      )}
    </>
  );
}
