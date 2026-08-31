'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicMenuItem, OrderSpace } from '@/lib/orders';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const STEPS = ['Your event', 'Menu', 'Details', 'Review'];

export default function OrderForm({
  menu,
  spaces,
  defaultName,
}: {
  menu: PublicMenuItem[];
  spaces: OrderSpace[];
  defaultName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reference, setReference] = useState('');

  const [organization, setOrganization] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventPurpose, setEventPurpose] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [locationFreetext, setLocationFreetext] = useState('');
  const [guests, setGuests] = useState('');

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [serviceExpectations, setServiceExpectations] = useState('');
  const [roomSetup, setRoomSetup] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [alcoholRequested, setAlcoholRequested] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, PublicMenuItem[]>();
    for (const m of menu) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()];
  }, [menu]);

  const chosen = menu.filter((m) => (quantities[m.id] ?? 0) > 0);
  const menuTotal = chosen.reduce(
    (s, m) => s + Number(m.unit_price) * quantities[m.id],
    0
  );

  const space = spaces.find((s) => s.id === spaceId);
  const facility = space ? Number(space.facility_rate_external) : 0;
  const total = menuTotal + facility;

  const belowMinimum = chosen.filter(
    (m) => m.minimum_quantity && quantities[m.id] < m.minimum_quantity
  );

  const overCapacity =
    space &&
    guests &&
    (space.capacity_standing ?? space.capacity_seated ?? 0) > 0 &&
    Number(guests) > (space.capacity_standing ?? space.capacity_seated ?? 0);

  function setQty(id: string, v: number) {
    setQuantities((q) => {
      const next = { ...q };
      if (v <= 0) delete next[id];
      else next[id] = v;
      return next;
    });
  }

  function validate(i: number) {
    const e: Record<string, string> = {};
    if (i === 0) {
      if (!eventName.trim()) e.eventName = 'Give your event a name.';
      if (!eventDate) e.eventDate = 'Choose a date.';
      if (!guests || Number(guests) < 1)
        e.guests = 'How many people are you expecting?';
      if (!spaceId) e.spaceId = 'Choose where you would like to hold it.';
      if (spaceId === 'other' && !locationFreetext.trim())
        e.locationFreetext = 'Tell us where.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function go(next: number) {
    if (next > step && !validate(step)) return;
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    setBusy(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization: organization || null,
          contactPhone: contactPhone || null,
          eventName,
          eventPurpose: eventPurpose || null,
          eventDate,
          startTime: startTime || null,
          endTime: endTime || null,
          spaceId: spaceId === 'other' ? null : spaceId,
          locationFreetext: spaceId === 'other' ? locationFreetext : null,
          guests: Number(guests),
          selections: chosen.map((m) => ({
            menuItemId: m.id,
            quantity: quantities[m.id],
          })),
          serviceExpectations: serviceExpectations || null,
          roomSetup: roomSetup || null,
          dietaryRestrictions: dietaryRestrictions || null,
          specialRequests: specialRequests || null,
          alcoholRequested,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setSubmitError(d.error ?? 'Could not place your order.');
        setBusy(false);
        return;
      }
      setReference(d.referenceCode);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Could not reach the server. Please call 641.628.5788.');
      setBusy(false);
    }
  }

  const err = (k: string) =>
    errors[k] ? <p className="err on">{errors[k]}</p> : null;

  /* ---------- confirmation ---------- */
  if (reference) {
    return (
      <div className="card">
        <span className="eyebrow">Order received</span>
        <h2>Thanks &mdash; we have your order</h2>
        <p className="confirm-code">{reference}</p>
        <p className="hint">
          Keep this reference. The events office will be in touch to confirm
          availability and take a deposit.
        </p>
        <ol className="next-steps">
          <li>
            We check the date, the room and our kitchen capacity, then come back
            to you to confirm.
          </li>
          <li>
            A $300 deposit holds your date. A signed agreement and a 50% deposit
            confirms the order.
          </li>
          <li>
            Your final guest count is due ten days before the event. Charges are
            based on that number.
          </li>
          <li>
            You can follow the whole thing from your own page at any time.
          </li>
        </ol>
        <div className="actions">
          <Link
            href="/my-requests"
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            View my orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="intake-layout">
      <div>
        <ol className="progress">
          {STEPS.map((s, i) => (
            <li key={s} data-state={i === step ? 'active' : i < step ? 'done' : ''}>
              <button type="button" onClick={() => i < step && go(i)}>
                <span className="letter">{i + 1}</span>
                <span className="name">{s}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* ---------- 1 ---------- */}
        {step === 0 && (
          <section className="card">
            <span className="eyebrow">Your event</span>
            <h2>What are you planning?</h2>
            <p className="hint">
              Tell us the basics. Nothing is booked until we come back to you and
              confirm.
            </p>

            <div className="grid two">
              <div className="field">
                <label htmlFor="or-org">Organization</label>
                <p className="sub">Leave blank for a private event.</p>
                <input id="or-org" type="text" value={organization}
                  onChange={(e) => setOrganization(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="or-phone">Phone</label>
                <input id="or-phone" type="tel" value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="or-name">Event name<span className="req">*</span></label>
              <input id="or-name" type="text"
                placeholder="Anderson wedding reception"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)} />
              {err('eventName')}
            </div>

            <div className="field">
              <label htmlFor="or-purpose">What is the occasion?</label>
              <textarea id="or-purpose" value={eventPurpose}
                onChange={(e) => setEventPurpose(e.target.value)} />
            </div>

            <div className="grid two">
              <div className="field">
                <label htmlFor="or-date">Date<span className="req">*</span></label>
                <input id="or-date" type="date" value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)} />
                {err('eventDate')}
              </div>
              <div className="field">
                <label htmlFor="or-guests">How many guests?<span className="req">*</span></label>
                <input id="or-guests" type="number" min={1} value={guests}
                  onChange={(e) => setGuests(e.target.value)} />
                {err('guests')}
              </div>
              <div className="field">
                <label htmlFor="or-start">Start time</label>
                <input id="or-start" type="time" value={startTime}
                  onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="or-end">End time</label>
                <input id="or-end" type="time" value={endTime}
                  onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="or-space">Where?<span className="req">*</span></label>
              <select id="or-space" value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}>
                <option value="">Choose a space</option>
                {spaces.filter((s) => s.supports_catering).map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.building ? `${s.building} \u2014 ${s.name}` : s.name}
                    {s.capacity_seated ? ` (seats ${s.capacity_seated})` : ''}
                    {Number(s.facility_rate_external) > 0
                      ? ` \u00b7 ${money(Number(s.facility_rate_external))} ${s.rate_basis}`
                      : ''}
                  </option>
                ))}
                <option value="other">Somewhere else, or off campus</option>
              </select>
              {err('spaceId')}
              {spaceId === 'other' && (
                <div className="conditional on">
                  <label htmlFor="or-loc">Where would you like it?</label>
                  <p className="sub">
                    We deliver in and around Pella. Delivery fees apply.
                  </p>
                  <input id="or-loc" type="text" value={locationFreetext}
                    onChange={(e) => setLocationFreetext(e.target.value)} />
                  {err('locationFreetext')}
                </div>
              )}
              {overCapacity && (
                <div className="callout c-warn" style={{ marginTop: '.8rem' }}>
                  <strong>That may be more people than the room holds</strong>
                  We will suggest an alternative if it does not work.
                </div>
              )}
            </div>

            <div className="actions">
              <button className="btn btn-primary" onClick={() => go(1)}>
                Choose your menu
              </button>
            </div>
          </section>
        )}

        {/* ---------- 2 ---------- */}
        {step === 1 && (
          <section className="card">
            <span className="eyebrow">Menu</span>
            <h2>What would you like served?</h2>
            <p className="hint">
              Enter a quantity for anything you want. Most items are priced per
              person, so a count matching your guest number is usually right.
            </p>

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
                        <label className="sr-only" htmlFor={`q-${m.id}`}>
                          Quantity of {m.name}
                        </label>
                        <input id={`q-${m.id}`} type="number" min={0}
                          value={qty || ''} placeholder="0"
                          onChange={(e) => setQty(m.id, Number(e.target.value))} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(0)}>Back</button>
              <button className="btn btn-primary" onClick={() => go(2)}>
                Continue
              </button>
            </div>
          </section>
        )}

        {/* ---------- 3 ---------- */}
        {step === 2 && (
          <section className="card">
            <span className="eyebrow">Details</span>
            <h2>How should it run?</h2>

            <div className="field">
              <label htmlFor="or-service">Service style</label>
              <p className="sub">Buffet, plated, drop-off, or staffed.</p>
              <textarea id="or-service" value={serviceExpectations}
                onChange={(e) => setServiceExpectations(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="or-setup">Room setup</label>
              <p className="sub">Rounds, theater, standing.</p>
              <textarea id="or-setup" value={roomSetup}
                onChange={(e) => setRoomSetup(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="or-diet">Dietary restrictions or allergies</label>
              <p className="sub">
                Tell us about every guest who needs an accommodation. Our kitchen
                is not allergen free, but we can usually work around most things
                given notice.
              </p>
              <textarea id="or-diet" value={dietaryRestrictions}
                onChange={(e) => setDietaryRestrictions(e.target.value)} />
            </div>

            <label className="chk-inline">
              <input type="checkbox" checked={alcoholRequested}
                onChange={(e) => setAlcoholRequested(e.target.checked)} />
              I would like bar service
            </label>
            <p className="sub">
              Bar packages are available with catering. Fees apply and we will
              quote separately.
            </p>

            <div className="field" style={{ marginTop: '1.1rem' }}>
              <label htmlFor="or-special">Anything else?</label>
              <textarea id="or-special" value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)} />
            </div>

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(1)}>Back</button>
              <button className="btn btn-primary" onClick={() => go(3)}>
                Review your order
              </button>
            </div>
          </section>
        )}

        {/* ---------- 4 ---------- */}
        {step === 3 && (
          <section className="card">
            <span className="eyebrow">Review</span>
            <h2>Check it over</h2>
            <p className="hint">
              Submitting does not book anything. We confirm availability, then
              take a deposit to hold your date.
            </p>

            {submitError && <div className="alert alert-error">{submitError}</div>}

            <div className="review-group">
              <h3>Your event</h3>
              <dl>
                <dt>Event</dt><dd>{eventName}</dd>
                <dt>Date</dt><dd>{eventDate}</dd>
                {startTime && (<><dt>Time</dt><dd>{startTime} &ndash; {endTime}</dd></>)}
                <dt>Where</dt>
                <dd>{space ? space.name : locationFreetext}</dd>
                <dt>Guests</dt><dd>{guests}</dd>
                {organization && (<><dt>Organization</dt><dd>{organization}</dd></>)}
              </dl>
            </div>

            {chosen.length > 0 && (
              <div className="review-group">
                <h3>Menu</h3>
                <dl>
                  {chosen.map((m) => (
                    <div key={m.id} style={{ display: 'contents' }}>
                      <dt>{m.name} &times;{quantities[m.id]}</dt>
                      <dd>{money(Number(m.unit_price) * quantities[m.id])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(2)}>Back</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? 'Sending...' : 'Place order'}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ---------- running total ---------- */}
      <aside className="panel">
        <div className="panel-head">
          <h3>Your order</h3>
          <p>{guests ? `${guests} guests` : 'Estimate'}</p>
        </div>
        <div className="panel-body">
          {chosen.length === 0 && facility === 0 ? (
            <p className="empty">Nothing chosen yet.</p>
          ) : (
            <>
              <ul className="estimate">
                {chosen.map((m) => (
                  <li key={m.id}>
                    <span>
                      {m.name}
                      <span className="estimate-qty">
                        {' \u00d7'}{quantities[m.id]}
                      </span>
                    </span>
                    <span>{money(Number(m.unit_price) * quantities[m.id])}</span>
                  </li>
                ))}
                {facility > 0 && space && (
                  <li>
                    <span>
                      Facility
                      <span className="estimate-qty"> {space.name}</span>
                    </span>
                    <span>{money(facility)}</span>
                  </li>
                )}
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
              {belowMinimum.map((m) => m.name).join(', ')}. We can often work
              around it &mdash; we will confirm.
            </div>
          )}

          <p className="disclaimer">
            An estimate at our standard rates. Final charges depend on your
            confirmed guest count, delivery if off campus, and anything we add
            after talking it through.
          </p>
        </div>
      </aside>
    </div>
  );
}
