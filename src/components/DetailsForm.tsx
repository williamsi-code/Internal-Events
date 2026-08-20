'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { classificationLabel, type Classification } from '@/lib/classify';
import type { MenuItemRow, SelectionRow, DetailsState } from '@/lib/requests';

export default function DetailsForm({
  requestId,
  state,
  menu,
  existing,
}: {
  requestId: string;
  state: DetailsState;
  menu: MenuItemRow[];
  existing: SelectionRow[];
}) {
  const router = useRouter();

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(existing.map((s) => [s.menu_item_id, s.quantity]))
  );
  const [serviceExpectations, setServiceExpectations] = useState(
    state.service_expectations ?? ''
  );
  const [roomSetup, setRoomSetup] = useState(state.room_setup ?? '');
  const [equipment, setEquipment] = useState(state.equipment ?? '');
  const [technology, setTechnology] = useState(state.technology ?? '');
  const [specialRequests, setSpecialRequests] = useState(
    state.special_requests ?? ''
  );
  const [dietaryRestrictions, setDietaryRestrictions] = useState(
    state.dietary_restrictions ?? ''
  );

  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const locked = !!state.details_confirmed_at;

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItemRow[]>();
    for (const m of menu) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()];
  }, [menu]);

  const chosen = menu.filter((m) => (quantities[m.id] ?? 0) > 0);
  const total = chosen.reduce(
    (sum, m) => sum + Number(m.unit_price) * (quantities[m.id] ?? 0),
    0
  );

  // Minimums are a warning rather than a block: the events office can
  // often accommodate a smaller order, and refusing outright would send
  // people back to email.
  const belowMinimum = chosen.filter(
    (m) => m.minimum_quantity && (quantities[m.id] ?? 0) < m.minimum_quantity
  );

  function setQty(id: string, value: number) {
    setSaved(false);
    setQuantities((q) => {
      const next = { ...q };
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function submit(confirm: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/requests/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          confirm,
          selections: chosen.map((m) => ({
            menuItemId: m.id,
            quantity: quantities[m.id],
          })),
          requirements: {
            serviceExpectations,
            roomSetup,
            equipment,
            technology,
            specialRequests,
            dietaryRestrictions,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setSaved(true);
      setBusy(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="intake-layout">
      <div>
        <div className="card">
          <span className="eyebrow">Menu</span>
          <h2>Choose your menu</h2>
          <p className="hint">
            Prices reflect your event&rsquo;s classification
            {state.classification
              ? `: ${classificationLabel(state.classification as Classification).toLowerCase()}`
              : ''}
            . Enter a quantity for anything you would like.
          </p>

          <div className="callout c-warn">
            <strong>Prices are subject to change</strong>
            If the classification of your event changes, the rates that apply
            change with it. The events office will let you know if that happens.
          </div>

          {locked && (
            <div className="callout c-default">
              <strong>Confirmed on {state.details_confirmed_at}</strong>
              To change anything now, send the events office a message.
            </div>
          )}

          {grouped.map(([category, items]) => (
            <div className="menu-group" key={category}>
              <h3>{category}</h3>
              {items.map((m) => {
                const qty = quantities[m.id] ?? 0;
                return (
                  <div className={`menu-row ${qty > 0 ? 'chosen' : ''}`} key={m.id}>
                    <div className="menu-info">
                      <div className="menu-name">{m.name}</div>
                      {m.description && (
                        <div className="menu-desc">{m.description}</div>
                      )}
                      <div className="menu-meta">
                        {money(Number(m.unit_price))} {m.unit}
                        {m.minimum_quantity && m.minimum_quantity > 1
                          ? ` \u00b7 minimum ${m.minimum_quantity}`
                          : ''}
                        {m.allergen_notes ? ` \u00b7 ${m.allergen_notes}` : ''}
                      </div>
                    </div>
                    <div className="menu-qty">
                      <label className="sr-only" htmlFor={`qty-${m.id}`}>
                        Quantity of {m.name}
                      </label>
                      <input
                        id={`qty-${m.id}`}
                        type="number"
                        min={0}
                        value={qty || ''}
                        placeholder="0"
                        disabled={locked}
                        onChange={(e) => setQty(m.id, Number(e.target.value))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '1rem' }}>
          <span className="eyebrow">Setup</span>
          <h2>Final details</h2>
          <p className="hint">
            How the room should be arranged and what you need in it.
          </p>

          <div className="field">
            <label htmlFor="serviceExpectations">Service style</label>
            <p className="sub">Buffet, plated, drop-off, staffed.</p>
            <textarea
              id="serviceExpectations"
              value={serviceExpectations}
              disabled={locked}
              onChange={(e) => {
                setServiceExpectations(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="roomSetup">Room setup</label>
            <p className="sub">Rounds, theater, classroom, standing.</p>
            <textarea
              id="roomSetup"
              value={roomSetup}
              disabled={locked}
              onChange={(e) => {
                setRoomSetup(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="equipment">Equipment</label>
            <textarea
              id="equipment"
              value={equipment}
              disabled={locked}
              onChange={(e) => {
                setEquipment(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="technology">Technology</label>
            <textarea
              id="technology"
              value={technology}
              disabled={locked}
              onChange={(e) => {
                setTechnology(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="dietaryRestrictions">
              Dietary restrictions or allergies
            </label>
            <p className="sub">
              Tell us about every guest who needs an accommodation. We would
              rather know twice than not at all.
            </p>
            <textarea
              id="dietaryRestrictions"
              value={dietaryRestrictions}
              disabled={locked}
              onChange={(e) => {
                setDietaryRestrictions(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="specialRequests">Anything else</label>
            <textarea
              id="specialRequests"
              value={specialRequests}
              disabled={locked}
              onChange={(e) => {
                setSpecialRequests(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </div>
      </div>

      <aside className="panel">
        <div className="panel-head">
          <h3>Your estimate</h3>
          <p>{state.estimated_attendance} guests expected</p>
        </div>
        <div className="panel-body">
          {chosen.length === 0 ? (
            <p className="empty">Nothing selected yet.</p>
          ) : (
            <>
              <ul className="estimate">
                {chosen.map((m) => (
                  <li key={m.id}>
                    <span>
                      {m.name}
                      <span className="estimate-qty">
                        {' \u00d7'}
                        {quantities[m.id]}
                      </span>
                    </span>
                    <span>{money(Number(m.unit_price) * quantities[m.id])}</span>
                  </li>
                ))}
              </ul>
              <div className="estimate-total">
                <span>Estimated total</span>
                <span>{money(total)}</span>
              </div>
            </>
          )}

          {belowMinimum.length > 0 && (
            <div className="callout c-warn" style={{ marginTop: '1rem' }}>
              <strong>Below the usual minimum</strong>
              {belowMinimum.map((m) => m.name).join(', ')}. We may still be able
              to do this, but the events office will confirm.
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {saved && !locked && (
            <div className="callout c-default">Saved.</div>
          )}

          {!locked && (
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-ghost"
                onClick={() => submit(false)}
                disabled={busy}
              >
                Save for now
              </button>
              <button
                className="btn btn-primary"
                onClick={() => submit(true)}
                disabled={busy || chosen.length === 0}
              >
                {busy ? 'Saving...' : 'Confirm details'}
              </button>
            </div>
          )}

          <p className="disclaimer">
            This is an estimate. Final charges depend on your confirmed guest
            count, which is due ten days before the event, and on any additional
            costs the events office identifies.
          </p>
        </div>
      </aside>
    </div>
  );
}