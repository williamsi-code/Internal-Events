'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { classificationLabel, type Classification } from '@/lib/classify';
import type { MenuItemRow, SelectionRow, DetailsState } from '@/lib/requests';
import type { RequestFoodSource, FacilityChargeState } from '@/lib/food-sources';
import { FOOD_SOURCE_LABEL } from '@/lib/food-sources';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function DetailsForm({
  requestId,
  state,
  menu,
  existing,
  foodSources,
  facility,
}: {
  requestId: string;
  state: DetailsState;
  menu: MenuItemRow[];
  existing: SelectionRow[];
  foodSources: RequestFoodSource[];
  facility: FacilityChargeState | null;
}) {
  const router = useRouter();

  const hasCentral = foodSources.some((f) => f.kind === 'central_dining');
  const outsideSources = foodSources.filter(
    (f) => f.kind === 'outside_caterer' || f.kind === 'donated'
  );
  const alreadyAcknowledged =
    outsideSources.length > 0 &&
    outsideSources.every((f) => f.policy_acknowledged_at);

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
  const [policyAck, setPolicyAck] = useState(alreadyAcknowledged);

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
  const menuTotal = chosen.reduce(
    (sum, m) => sum + Number(m.unit_price) * (quantities[m.id] ?? 0),
    0
  );

  const facilityCharge = Number(facility?.applied ?? 0);
  const facilityPending =
    outsideSources.length > 0 && facility?.applied === null;
  const total = menuTotal + facilityCharge;

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

  const canConfirm =
    (!hasCentral || chosen.length > 0) &&
    (outsideSources.length === 0 || policyAck);

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
          policyAcknowledged: policyAck,
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

  return (
    <div className="intake-layout">
      <div>
        {/* Who is providing food, and what that means for this page. */}
        <div className="card">
          <span className="eyebrow">Food</span>
          <h2>Who is providing the food</h2>
          <ul className="source-list">
            {foodSources.map((f) => (
              <li key={f.id}>
                <span>
                  <span className="source-name">
                    {FOOD_SOURCE_LABEL[f.kind]}
                    {f.caterer_name ? ` \u2014 ${f.caterer_name}` : ''}
                    {!f.caterer_name && f.caterer_other
                      ? ` \u2014 ${f.caterer_other}`
                      : ''}
                  </span>
                  {f.covers && (
                    <span className="source-covers">Covering: {f.covers}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="sub" style={{ marginTop: '.8rem' }}>
            To change this, send the events office a message on your request.
          </p>
        </div>

        {hasCentral && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <span className="eyebrow">Menu</span>
            <h2>Choose your menu</h2>
            <p className="hint">
              Prices reflect your event&rsquo;s classification
              {state.classification
                ? `: ${classificationLabel(
                    state.classification as Classification
                  ).toLowerCase()}`
                : ''}
              . Enter a quantity for anything you would like.
            </p>

            <div className="callout c-warn">
              <strong>Prices are subject to change</strong>
              If the classification of your event changes, the rates that apply
              change with it. The events office will let you know if that
              happens.
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
                    <div
                      className={`menu-row ${qty > 0 ? 'chosen' : ''}`}
                      key={m.id}
                    >
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
        )}

        {!hasCentral && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <span className="eyebrow">Menu</span>
            <h2>No menu for this event</h2>
            <p className="hint">
              Central Dining is not providing food, so there is nothing to
              choose here. Arrange the food directly with your caterer, and
              confirm the setup details below.
            </p>
          </div>
        )}

        {outsideSources.length > 0 && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <span className="eyebrow">Requirements</span>
            <h2>Food brought onto campus</h2>
            <p className="hint">
              Your department sponsors this arrangement and is accountable for
              it, including the caterer&rsquo;s timing, conduct, and clean-up.
            </p>

            <ul className="info-list">
              {outsideSources.some((f) => f.kind === 'outside_caterer') && (
                <li>
                  <Link href="/info/outside-caterer-policy" target="_blank">
                    Outside caterer requirements
                  </Link>
                </li>
              )}
              {outsideSources.some((f) => f.kind === 'donated') && (
                <li>
                  <Link href="/info/donated-food-policy" target="_blank">
                    Donated food requirements
                  </Link>
                </li>
              )}
            </ul>

            {alreadyAcknowledged ? (
              <div className="callout c-default">
                <strong>Requirements acknowledged</strong>
                Recorded on {outsideSources[0].policy_acknowledged_at}.
              </div>
            ) : (
              <label className="chk-inline" style={{ marginTop: '.8rem' }}>
                <input
                  type="checkbox"
                  checked={policyAck}
                  disabled={locked}
                  onChange={(e) => {
                    setPolicyAck(e.target.checked);
                    setSaved(false);
                  }}
                />
                I have read these requirements and my department accepts
                responsibility for the food brought onto campus
              </label>
            )}
          </div>
        )}

        <div className="card" style={{ marginTop: '1rem' }}>
          <span className="eyebrow">Setup</span>
          <h2>Final details</h2>
          <p className="hint">
            How the room should be arranged and what you need in it.
          </p>

          {hasCentral && (
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
          )}

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
              {hasCentral
                ? 'Tell us about every guest who needs an accommodation. We would rather know twice than not at all.'
                : 'Pass these to your caterer as well. We keep them on the record either way.'}
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
          {hasCentral && chosen.length === 0 && (
            <p className="empty">Nothing selected yet.</p>
          )}

          {chosen.length > 0 && (
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
          )}

          {facilityCharge > 0 && (
            <ul className="estimate">
              <li>
                <span>
                  Facility charge
                  {facility?.space_name && (
                    <span className="estimate-qty"> {facility.space_name}</span>
                  )}
                </span>
                <span>{money(facilityCharge)}</span>
              </li>
            </ul>
          )}

          {(chosen.length > 0 || facilityCharge > 0) && (
            <div className="estimate-total">
              <span>Estimated total</span>
              <span>{money(total)}</span>
            </div>
          )}

          {facilityPending && (
            <div className="callout c-warn" style={{ marginTop: '1rem' }}>
              <strong>Facility charge not yet set</strong>
              The events office will confirm whether one applies to your event.
            </div>
          )}

          {belowMinimum.length > 0 && (
            <div className="callout c-warn" style={{ marginTop: '1rem' }}>
              <strong>Below the usual minimum</strong>
              {belowMinimum.map((m) => m.name).join(', ')}. We may still be able
              to do this, but the events office will confirm.
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {saved && !locked && <div className="callout c-default">Saved.</div>}

          {!locked && (
            <>
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
                  disabled={busy || !canConfirm}
                >
                  {busy ? 'Saving...' : 'Confirm details'}
                </button>
              </div>
              {!canConfirm && (
                <p className="sub" style={{ marginTop: '.6rem' }}>
                  {hasCentral && chosen.length === 0
                    ? 'Choose at least one menu item before confirming.'
                    : 'Acknowledge the requirements above before confirming.'}
                </p>
              )}
            </>
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
