'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { classificationLabel, type Classification } from '@/lib/classify';
import type { MenuItemRow, SelectionRow, DetailsState } from '@/lib/requests';
import type { RequestFoodSource, FacilityChargeState } from '@/lib/food-sources';
import { FOOD_SOURCE_LABEL } from '@/lib/food-labels';
import MenuChoices, { type ChoiceValue } from './MenuChoices';
import SetupChecklist, { type SetupValue } from './SetupChecklist';
import type { SetupOption } from '@/lib/setup-labels';
import type { ChoiceGroup } from '@/lib/choices';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function DetailsForm({
  requestId,
  state,
  menu,
  existing,
  foodSources,
  facility,
  choiceGroups,
  existingChoices,
  setupOptions,
  existingSetup,
  stage,
}: {
  requestId: string;
  state: DetailsState;
  menu: MenuItemRow[];
  existing: SelectionRow[];
  foodSources: RequestFoodSource[];
  facility: FacilityChargeState | null;
  /** Keyed by menu item id. A plain object rather than a Map, because
   *  a Map does not survive the server-to-client boundary. */
  choiceGroups: Record<string, ChoiceGroup[]>;
  existingChoices: Record<string, ChoiceValue[]>;
  /** What the booked room can do, and what has been picked so far. */
  setupOptions: SetupOption[];
  existingSetup: SetupValue[];
  /** The menu and the setup are two conversations, often on two
   *  different days. One component, two pages. */
  stage: 'menu' | 'details';
}) {
  const router = useRouter();
  const onMenu = stage === 'menu';

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
  // What was picked inside each item, keyed by menu item id.
  const [choices, setChoices] = useState<Record<string, ChoiceValue[]>>(
    existingChoices
  );
  const [setupValues, setSetupValues] = useState<SetupValue[]>(existingSetup);

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

  /** Options that cost extra are part of the per-person price, so the
   *  estimate has to include them or it understates the total. */
  function unitPriceFor(m: MenuItemRow) {
    const picked = choices[m.id] ?? [];
    const groups = choiceGroups[m.id] ?? [];
    const delta = picked.reduce((sum, v) => {
      for (const g of groups) {
        const o = g.options.find((x) => x.id === v.optionId);
        if (o) return sum + Number(o.price_delta);
      }
      return sum;
    }, 0);
    return Number(m.unit_price) + delta;
  }

  const menuTotal = chosen.reduce(
    (sum, m) => sum + unitPriceFor(m) * (quantities[m.id] ?? 0),
    0
  );

  /** Items where a required choice has not been made. Confirming with
   *  one of these outstanding would leave the kitchen guessing. */
  const incomplete = chosen.filter((m) => {
    const groups = choiceGroups[m.id] ?? [];
    const picked = choices[m.id] ?? [];
    return groups.some((g) => {
      const inGroup = picked.filter((v) =>
        g.options.some((o) => o.id === v.optionId)
      );
      return inGroup.length < g.min_select;
    });
  });

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
    // Removing an item drops its choices too, so a re-added item does
    // not silently keep a selection the requester never revisited.
    if (value <= 0) {
      setChoices((c) => {
        const next = { ...c };
        delete next[id];
        return next;
      });
    }
  }

  const canConfirm = onMenu
    ? chosen.length > 0 && incomplete.length === 0
    : outsideSources.length === 0 || policyAck;

  async function submit(confirm: boolean) {
    // On the menu step, confirming settles the food and moves on. The
    // event is not ready for final review until the setup is done too.
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/requests/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          confirm,
          stage,
          setupSelections: setupValues.map((v) => ({
            optionId: v.optionId,
            count: v.count,
          })),
          policyAcknowledged: policyAck,
          selections: chosen.map((m) => ({
            menuItemId: m.id,
            quantity: quantities[m.id],
            choices: (choices[m.id] ?? []).map((v) => ({
              optionId: v.optionId,
              quantity: v.quantity,
            })),
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
      if (confirm && onMenu) {
        router.push(`/my-requests/${requestId}/details`);
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
          <div
            className="card"
            style={{
              marginTop: '1rem',
              display: onMenu ? undefined : 'none',
            }}
          >
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

            {/* Seventeen sections is too many to scroll past. */}
            <nav className="menu-jump" aria-label="Jump to a section">
              {grouped.map(([category]) => (
                <a
                  href={`#menu-${category.replace(/\s+/g, '-').toLowerCase()}`}
                  key={category}
                >
                  {category}
                  {chosen.some((m) => m.category === category) && (
                    <span className="jump-dot" aria-label="has items" />
                  )}
                </a>
              ))}
            </nav>

            {grouped.map(([category, items]) => (
              <div
                className="menu-group"
                key={category}
                id={`menu-${category.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <h3>{category}</h3>
                {items.map((m) => {
                  const qty = quantities[m.id] ?? 0;
                  return (
                    <div
                      className={`menu-row ${qty > 0 ? 'chosen' : ''}${
                        qty > 0 && (choiceGroups[m.id]?.length ?? 0) > 0
                          ? ' has-choices'
                          : ''
                      }`}
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

                      {/* Choices appear once something is ordered.
                          Showing them on every row would make the menu
                          unreadable. */}
                      {qty > 0 && (choiceGroups[m.id]?.length ?? 0) > 0 && (
                        <MenuChoices
                          groups={choiceGroups[m.id]}
                          values={choices[m.id] ?? []}
                          orderedQuantity={qty}
                          disabled={locked}
                          onChange={(next) => {
                            setChoices((c) => ({ ...c, [m.id]: next }));
                            setSaved(false);
                          }}
                        />
                      )}
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
              Central Catering is not providing food, so there is nothing to
              choose here. Arrange the food directly with your caterer, and
              confirm the setup details below.
            </p>
          </div>
        )}

        {outsideSources.length > 0 && (
          <div
            className="card"
            style={{
              marginTop: '1rem',
              display: onMenu ? 'none' : undefined,
            }}
          >
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

        <div
          className="card"
          style={{ marginTop: '1rem', display: onMenu ? 'none' : undefined }}
        >
          <span className="eyebrow">Setup</span>
          <h2>Final details</h2>

          <p className="sub" style={{ marginBottom: '1rem' }}>
            You told us roughly what you needed when you asked. This is the
            chance to be precise, now that the room is settled.
          </p>

          <SetupChecklist
            options={setupOptions}
            values={setupValues}
            onChange={(next) => {
              setSetupValues(next);
              setSaved(false);
            }}
            spaceChosen={setupOptions.length > 0}
          />

          <hr className="soft-rule" />
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
              {chosen.map((m) => {
                const picked = (choices[m.id] ?? [])
                  .map((v) => {
                    for (const g of choiceGroups[m.id] ?? []) {
                      const o = g.options.find((x) => x.id === v.optionId);
                      if (o) {
                        return v.quantity
                          ? `${o.label} \u00d7${v.quantity}`
                          : o.label;
                      }
                    }
                    return null;
                  })
                  .filter(Boolean);

                return (
                  <li key={m.id}>
                    <span>
                      {m.name}
                      <span className="estimate-qty">
                        {' \u00d7'}
                        {quantities[m.id]}
                      </span>
                      {picked.length > 0 && (
                        <span className="estimate-choices">
                          {picked.join(', ')}
                        </span>
                      )}
                    </span>
                    <span>{money(unitPriceFor(m) * quantities[m.id])}</span>
                  </li>
                );
              })}
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
                {!onMenu && hasCentral && (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      router.push(`/my-requests/${requestId}/menu`)
                    }
                    disabled={busy}
                  >
                    Back to the menu
                  </button>
                )}
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
                  {busy
                    ? 'Saving...'
                    : onMenu
                      ? 'Confirm menu and continue'
                      : 'Confirm details'}
                </button>
              </div>
              {!canConfirm && (
                <p className="sub" style={{ marginTop: '.6rem' }}>
                  {onMenu && chosen.length === 0
                    ? 'Choose at least one menu item before continuing.'
                    : incomplete.length > 0
                      ? `Still to choose: ${incomplete
                          .map((m) => m.name)
                          .join(', ')}.`
                      : 'Acknowledge the requirements above before confirming.'}
                </p>
              )}
            </>
          )}

          {onMenu && (
            <p className="sub" style={{ marginTop: '.8rem' }}>
              Next you will tell us how the room should be set up. You can come
              back and change the menu until the events office reviews it.
            </p>
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
