'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  classify,
  classificationLabel,
  type Classification,
  type Party,
  type YesNoUnsure,
} from '@/lib/classify';
import FoodSourcePicker, { type FoodSource } from './FoodSourcePicker';
import type { ApprovedCaterer } from '@/lib/caterers';

export interface EventTypeOption {
  id: string;
  name: string;
  category: string;
  default_classification: Classification | null;
  always_review: boolean;
  guidance: string | null;
}

export interface SpaceOption {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
}

const STEPS = [
  { letter: 'A', name: 'Event details' },
  { letter: 'B', name: 'Requirements' },
  { letter: 'C', name: 'Funding' },
  { letter: 'D', name: 'Classification' },
  { letter: '·', name: 'Review & submit' },
];

const PARTY_LABEL: Record<string, string> = {
  central: 'Central College',
  shared: 'Shared',
  outside: 'Outside party',
  unclear: 'Not sure',
  yes: 'Yes',
  no: 'No',
  unsure: 'Not sure',
};

const VERDICT_CLASS: Record<string, string> = {
  internal: 'internal',
  affiliated: 'affiliated',
  external: 'external',
  needs_management_review: 'review',
};

export default function IntakeForm({
  eventTypes,
  spaces,
  caterers,
  defaultDepartment,
}: {
  eventTypes: EventTypeOption[];
  spaces: SpaceOption[];
  caterers: ApprovedCaterer[];
  defaultDepartment: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reference, setReference] = useState('');

  // A
  const [departmentOrg, setDepartmentOrg] = useState(defaultDepartment);
  const [contactPhone, setContactPhone] = useState('');
  const [eventTypeId, setEventTypeId] = useState('');
  const [eventTypeOther, setEventTypeOther] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventPurpose, setEventPurpose] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [locationFreetext, setLocationFreetext] = useState('');
  const [estimatedAttendance, setEstimatedAttendance] = useState('');
  const [foodSources, setFoodSources] = useState<FoodSource[]>([
    { kind: 'central_dining', catererId: '', catererOther: '', covers: '' },
  ]);

  // B
  const [foodNeeds, setFoodNeeds] = useState('');
  const [serviceExpectations, setServiceExpectations] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [roomSetup, setRoomSetup] = useState('');
  const [equipment, setEquipment] = useState('');
  const [technology, setTechnology] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');

  // C
  const [budgetAccount, setBudgetAccount] = useState('');
  const [outsideOrgInvolved, setOutsideOrgInvolved] = useState('');
  const [outsideOrgName, setOutsideOrgName] = useState('');
  const [outsideFunding, setOutsideFunding] = useState('');
  const [outsideFundingDetail, setOutsideFundingDetail] = useState('');
  const [revenueCollected, setRevenueCollected] = useState('');
  const [revenueRecipient, setRevenueRecipient] = useState('');
  const [financialRisk, setFinancialRisk] = useState('');

  // D
  const [officialBusiness, setOfficialBusiness] = useState('');
  const [eventOwner, setEventOwner] = useState('');
  const [primaryBeneficiary, setPrimaryBeneficiary] = useState('');
  const [primaryPayer, setPrimaryPayer] = useState('');
  const [wouldOccurWithout, setWouldOccurWithout] = useState('');
  const [requesterNotes, setRequesterNotes] = useState('');

  const selectedType = eventTypes.find(t => t.id === eventTypeId);

  const grouped = useMemo(() => {
    const map = new Map<string, EventTypeOption[]>();
    for (const t of eventTypes) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return [...map.entries()];
  }, [eventTypes]);

  const advisory = useMemo(
    () =>
      classify({
        typeDefault: selectedType?.default_classification ?? null,
        typeAlwaysReview: selectedType ? selectedType.always_review : eventTypeId === 'other',
        officialBusiness: (officialBusiness || undefined) as YesNoUnsure | undefined,
        eventOwner: (eventOwner || undefined) as Party | undefined,
        primaryBeneficiary: (primaryBeneficiary || undefined) as Party | undefined,
        primaryPayer: (primaryPayer || undefined) as Party | undefined,
        financialRisk: (financialRisk || undefined) as Party | undefined,
        wouldOccurWithout: (wouldOccurWithout || undefined) as YesNoUnsure | undefined,
        outsideOrgInvolved: outsideOrgInvolved === 'yes',
        revenueCollected: revenueCollected === 'yes',
      }),
    [
      selectedType, eventTypeId, officialBusiness, eventOwner, primaryBeneficiary,
      primaryPayer, financialRisk, wouldOccurWithout, outsideOrgInvolved, revenueCollected,
    ]
  );

  function validate(index: number) {
    const e: Record<string, string> = {};
    if (index === 0) {
      if (!eventTypeId) e.eventTypeId = 'Choose an event type.';
      if (eventTypeId === 'other' && !eventTypeOther.trim())
        e.eventTypeOther = 'Describe your event type.';
      if (!eventName.trim()) e.eventName = 'Give the event a name.';
      if (!eventDate) e.eventDate = 'Choose a date.';
      if (!startTime) e.startTime = 'Enter a start time.';
      if (!endTime) e.endTime = 'Enter an end time.';
      if (!spaceId) e.spaceId = 'Choose a location.';
      if (spaceId === 'other' && !locationFreetext.trim())
        e.locationFreetext = 'Describe the location.';
      if (!estimatedAttendance || Number(estimatedAttendance) < 1)
        e.estimatedAttendance = 'Enter an estimated number of guests.';
      if (!departmentOrg.trim()) e.departmentOrg = 'Enter your department or organization.';
      if (foodSources.length === 0)
        e.foodSources = 'Choose who is providing the food.';
      const oc = foodSources.find((f) => f.kind === 'outside_caterer');
      if (oc && !oc.catererId && !oc.catererOther.trim())
        e.foodSources = 'Choose a caterer, or tell us who you have in mind.';
      const dn = foodSources.find((f) => f.kind === 'donated');
      if (dn && !dn.catererOther.trim())
        e.foodSources = 'Tell us where the donated food is coming from.';
    }
    if (index === 2) {
      if (!outsideOrgInvolved) e.outsideOrgInvolved = 'Choose yes or no.';
      if (!outsideFunding) e.outsideFunding = 'Choose yes or no.';
      if (!revenueCollected) e.revenueCollected = 'Choose yes or no.';
      if (!financialRisk) e.financialRisk = 'Choose one.';
    }
    if (index === 3) {
      if (!officialBusiness) e.officialBusiness = 'Choose one.';
      if (!eventOwner) e.eventOwner = 'Choose one.';
      if (!primaryBeneficiary) e.primaryBeneficiary = 'Choose one.';
      if (!primaryPayer) e.primaryPayer = 'Choose one.';
      if (!wouldOccurWithout) e.wouldOccurWithout = 'Choose one.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function go(next: number) {
    if (next > step && !validate(step)) return;
    setStep(next);
    setFurthest(f => Math.max(f, next));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (!validate(3)) { setStep(3); return; }
    setBusy(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: eventTypeId === 'other' ? null : eventTypeId,
          eventTypeOther: eventTypeId === 'other' ? eventTypeOther : null,
          eventName,
          eventPurpose,
          eventDate,
          startTime: startTime || null,
          endTime: endTime || null,
          spaceId: spaceId === 'other' ? null : spaceId,
          locationFreetext: spaceId === 'other' ? locationFreetext : null,
          estimatedAttendance: Number(estimatedAttendance),
          departmentOrg,
          contactPhone: contactPhone || null,
          foodSources: foodSources.map((f) => ({
            kind: f.kind,
            catererId: f.catererId || null,
            catererOther: f.catererOther || null,
            covers: f.covers || null,
          })),
          requirements: {
            foodNeeds, serviceExpectations, roomSetup,
            equipment, technology, specialRequests, dietaryRestrictions,
          },
          funding: {
            budgetAccount,
            outsideOrgInvolved: outsideOrgInvolved === 'yes',
            outsideOrgName,
            outsideFunding: outsideFunding === 'yes',
            outsideFundingDetail,
            revenueCollected: revenueCollected === 'yes',
            revenueDetail: '',
            revenueRecipient,
            financialRiskBearer: financialRisk,
          },
          answers: {
            officialBusiness, eventOwner, primaryBeneficiary,
            primaryPayer, wouldOccurWithout, requesterNotes,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? 'Could not submit the request.');
        setBusy(false);
        return;
      }
      setReference(data.referenceCode);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  /* ---------- confirmation ---------- */
  if (reference) {
    return (
      <div className="card">
        <span className="eyebrow">Submitted</span>
        <h2>Your request is with the events office</h2>
        <p className="confirm-code">{reference}</p>
        <p className="hint">
          Keep this reference number — it identifies your request in any email
          or phone call.
        </p>
        <ol className="next-steps">
          <li>
            The events office reviews your request and confirms the
            classification. If anything is unclear, they will send you a
            question rather than guessing.
          </li>
          <li>
            Once classified, you will receive the applicable policies and an
            estimated charge for your department or organization.
          </li>
          <li>
            You will then choose menu items and confirm setup, equipment, and
            technology details.
          </li>
          <li>
            Final headcount is locked shortly before the event, and the
            confirmed details are sent to everyone involved.
          </li>
        </ol>
        <button
          className="btn btn-ghost"
          style={{ marginTop: '1.5rem' }}
          onClick={() => router.push('/')}
        >
          Back to Events &amp; Conferences
        </button>
      </div>
    );
  }

  const radios = (
    name: string,
    value: string,
    setter: (v: string) => void,
    options: [string, string][]
  ) => (
    <div className="choices" role="radiogroup" aria-label={name}>
      {options.map(([v, label]) => (
        <label className="choice" key={v}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => setter(v)}
          />
          {label}
        </label>
      ))}
    </div>
  );

  const err = (key: string) =>
    errors[key] ? <p className="err on">{errors[key]}</p> : null;

  return (
    <div className="intake-layout">
      <div>
        <ol className="progress">
          {STEPS.map((s, i) => (
            <li key={s.name} data-state={i === step ? 'active' : i < furthest ? 'done' : ''}>
              <button type="button" onClick={() => i <= furthest && go(i)}>
                <span className="letter">{s.letter}</span>
                <span className="name">{s.name}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* ---------- A ---------- */}
        {step === 0 && (
          <section className="card">
            <span className="eyebrow">Section A</span>
            <h2>Requester &amp; event information</h2>
            <p className="hint">
              The basics. If your date or space is not settled yet, give your
              best estimate — we confirm availability before anything is booked.
            </p>

            <div className="field">
              <label htmlFor="eventTypeId">What kind of event is this?<span className="req">*</span></label>
              <p className="sub">
                Pick the closest match. This is the single most useful thing you
                can tell us — most classifications are already decided for common
                event types.
              </p>
              <select id="eventTypeId" value={eventTypeId} onChange={e => setEventTypeId(e.target.value)}>
                <option value="">Choose an event type</option>
                {grouped.map(([category, items]) => (
                  <optgroup label={category} key={category}>
                    {items.map(t => (
                      <option value={t.id} key={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                ))}
                <option value="other">Something else — not listed here</option>
              </select>
              {err('eventTypeId')}
              {selectedType?.guidance && (
                <p className="sub" style={{ color: 'var(--brass)', marginTop: '.6rem' }}>
                  {selectedType.guidance}
                </p>
              )}
              {eventTypeId === 'other' && (
                <div className="conditional on">
                  <label htmlFor="eventTypeOther">Describe your event type</label>
                  <input id="eventTypeOther" type="text" value={eventTypeOther}
                    onChange={e => setEventTypeOther(e.target.value)} />
                  {err('eventTypeOther')}
                </div>
              )}
            </div>

            <FoodSourcePicker
              sources={foodSources}
              setSources={setFoodSources}
              caterers={caterers}
              error={errors.foodSources}
            />

            <div className="grid two">
              <div className="field">
                <label htmlFor="departmentOrg">Department or organization<span className="req">*</span></label>
                <input id="departmentOrg" type="text" value={departmentOrg}
                  onChange={e => setDepartmentOrg(e.target.value)} />
                {err('departmentOrg')}
              </div>
              <div className="field">
                <label htmlFor="contactPhone">Phone</label>
                <input id="contactPhone" type="tel" value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="eventName">Event name<span className="req">*</span></label>
              <input id="eventName" type="text" value={eventName}
                onChange={e => setEventName(e.target.value)} />
              {err('eventName')}
            </div>

            <div className="field">
                            <label htmlFor="eventPurpose">Event purpose</label>
                            <p className="sub">
                Optional, but helpful. What is the event for, and who is it for?
              </p>
              <textarea id="eventPurpose" value={eventPurpose}
                onChange={e => setEventPurpose(e.target.value)} />
            </div>

            <div className="grid two">
              <div className="field">
                <label htmlFor="eventDate">Event date<span className="req">*</span></label>
                <input id="eventDate" type="date" value={eventDate}
                  onChange={e => setEventDate(e.target.value)} />
                {err('eventDate')}
              </div>
              <div className="field">
                <label htmlFor="estimatedAttendance">Estimated attendance<span className="req">*</span></label>
                <input id="estimatedAttendance" type="number" min={1} value={estimatedAttendance}
                  onChange={e => setEstimatedAttendance(e.target.value)} />
                {err('estimatedAttendance')}
              </div>
              <div className="field">
                <label htmlFor="startTime">Start time<span className="req">*</span></label>
                <input id="startTime" type="time" value={startTime}
                  onChange={e => setStartTime(e.target.value)} />
                {err('startTime')}
              </div>
              <div className="field">
                <label htmlFor="endTime">End time<span className="req">*</span></label>
                <input id="endTime" type="time" value={endTime}
                  onChange={e => setEndTime(e.target.value)} />
                {err('endTime')}
              </div>
            </div>

            <div className="field">
              <label htmlFor="spaceId">Location requested<span className="req">*</span></label>
              <select id="spaceId" value={spaceId} onChange={e => setSpaceId(e.target.value)}>
                <option value="">Choose a space</option>
                {spaces.map(s => (
                  <option value={s.id} key={s.id}>
                    {s.building ? `${s.building} — ${s.name}` : s.name}
                    {s.capacity_seated ? ` (seats ${s.capacity_seated})` : ''}
                  </option>
                ))}
                <option value="other">Other / not sure yet</option>
              </select>
              {err('spaceId')}
              {spaceId === 'other' && (
                <div className="conditional on">
                  <label htmlFor="locationFreetext">Describe the location you have in mind</label>
                  <input id="locationFreetext" type="text" value={locationFreetext}
                    onChange={e => setLocationFreetext(e.target.value)} />
                  {err('locationFreetext')}
                </div>
              )}
            </div>

            <div className="actions">
              <button className="btn btn-primary" onClick={() => go(1)}>
                Continue to requirements
              </button>
            </div>
          </section>
        )}

        {/* ---------- B ---------- */}
        {step === 1 && (
          <section className="card">
            <span className="eyebrow">Section B</span>
            <h2>Event requirements</h2>
            <p className="hint">
              What you would like us to provide. Nothing here is final — you
              choose specific menu items after your event is classified.
            </p>

            <div className="field">
              <label htmlFor="foodNeeds">Food and beverage needs</label>
              <p className="sub">Meal, refreshments, reception, or none at all.</p>
              <textarea id="foodNeeds" value={foodNeeds} onChange={e => setFoodNeeds(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="serviceExpectations">Service expectations</label>
              <p className="sub">Buffet, plated, drop-off, staffed bar, self-serve.</p>
              <textarea id="serviceExpectations" value={serviceExpectations}
                onChange={e => setServiceExpectations(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dietaryRestrictions">Dietary restrictions or allergies</label>
              <textarea id="dietaryRestrictions" value={dietaryRestrictions}
                onChange={e => setDietaryRestrictions(e.target.value)} />
            </div>

            <div className="grid two">
              <div className="field">
                <label htmlFor="roomSetup">Room setup</label>
                <p className="sub">Rounds, theater, classroom, standing.</p>
                <textarea id="roomSetup" value={roomSetup} onChange={e => setRoomSetup(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="equipment">Equipment</label>
                <p className="sub">Tables, linens, staging, podium.</p>
                <textarea id="equipment" value={equipment} onChange={e => setEquipment(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="technology">Technology</label>
                <p className="sub">Projection, microphones, livestream, hybrid.</p>
                <textarea id="technology" value={technology} onChange={e => setTechnology(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="specialRequests">Special requests</label>
                <textarea id="specialRequests" value={specialRequests}
                  onChange={e => setSpecialRequests(e.target.value)} />
              </div>
            </div>

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(0)}>Back</button>
              <button className="btn btn-primary" onClick={() => go(2)}>Continue to funding</button>
            </div>
          </section>
        )}

        {/* ---------- C ---------- */}
        {step === 2 && (
          <section className="card">
            <span className="eyebrow">Section C</span>
            <h2>Funding &amp; outside involvement</h2>
            <p className="hint">
              How the event is paid for, and whether anyone outside Central is
              involved. These answers do most of the work in determining your
              classification.
            </p>

            <div className="field">
              <label htmlFor="budgetAccount">Central budget or account number</label>
              <p className="sub">Leave blank if no Central account is funding this.</p>
              <input id="budgetAccount" type="text" value={budgetAccount}
                onChange={e => setBudgetAccount(e.target.value)} />
            </div>

            <fieldset className="field">
              <span className="legend">Is an outside organization involved?<span className="req">*</span></span>
              <p className="sub">Any group, business, or partner that is not part of Central College.</p>
              {radios('outsideOrgInvolved', outsideOrgInvolved, setOutsideOrgInvolved,
                [['yes', 'Yes'], ['no', 'No']])}
              {err('outsideOrgInvolved')}
              {outsideOrgInvolved === 'yes' && (
                <div className="conditional on">
                  <label htmlFor="outsideOrgName">Name of the outside organization</label>
                  <input id="outsideOrgName" type="text" value={outsideOrgName}
                    onChange={e => setOutsideOrgName(e.target.value)} />
                </div>
              )}
            </fieldset>

            <fieldset className="field">
              <span className="legend">Is there outside funding, a grant, or sponsorship?<span className="req">*</span></span>
              {radios('outsideFunding', outsideFunding, setOutsideFunding,
                [['yes', 'Yes'], ['no', 'No']])}
              {err('outsideFunding')}
              {outsideFunding === 'yes' && (
                <div className="conditional on">
                  <label htmlFor="outsideFundingDetail">Describe the funding source</label>
                  <input id="outsideFundingDetail" type="text" value={outsideFundingDetail}
                    onChange={e => setOutsideFundingDetail(e.target.value)} />
                </div>
              )}
            </fieldset>

            <fieldset className="field">
              <span className="legend">Will registration, admission, or other revenue be collected?<span className="req">*</span></span>
              {radios('revenueCollected', revenueCollected, setRevenueCollected,
                [['yes', 'Yes'], ['no', 'No']])}
              {err('revenueCollected')}
              {revenueCollected === 'yes' && (
                <div className="conditional on">
                  <label htmlFor="revenueRecipient">Who receives the revenue?</label>
                  <input id="revenueRecipient" type="text" value={revenueRecipient}
                    onChange={e => setRevenueRecipient(e.target.value)} />
                </div>
              )}
            </fieldset>

            <fieldset className="field">
              <span className="legend">Who assumes the financial risk?<span className="req">*</span></span>
              <p className="sub">If the event loses money or is cancelled late, who absorbs the cost?</p>
              {radios('financialRisk', financialRisk, setFinancialRisk, [
                ['central', 'Central College'], ['shared', 'Shared'],
                ['outside', 'The outside party'], ['unclear', 'Not sure'],
              ])}
              {err('financialRisk')}
            </fieldset>

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(1)}>Back</button>
              <button className="btn btn-primary" onClick={() => go(3)}>Continue to classification</button>
            </div>
          </section>
        )}

        {/* ---------- D ---------- */}
        {step === 3 && (
          <section className="card">
            <span className="eyebrow">Section D</span>
            <h2>Classification questions</h2>
            <p className="hint">
              Five questions that determine how your event is classified. Answer
              them as plainly as you can — &ldquo;not sure&rdquo; is a valid
              answer and simply routes your request for a closer look.
            </p>

            <fieldset className="field">
              <span className="legend">Is this official Central College business?<span className="req">*</span></span>
              {radios('officialBusiness', officialBusiness, setOfficialBusiness,
                [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']])}
              {err('officialBusiness')}
            </fieldset>

            <fieldset className="field">
              <span className="legend">Who owns and controls the event?<span className="req">*</span></span>
              <p className="sub">Who decides the program, the guest list, and how it runs.</p>
              {radios('eventOwner', eventOwner, setEventOwner, [
                ['central', 'Central'], ['shared', 'Shared'],
                ['outside', 'Outside party'], ['unclear', 'Not sure'],
              ])}
              {err('eventOwner')}
            </fieldset>

            <fieldset className="field">
              <span className="legend">Who primarily benefits?<span className="req">*</span></span>
              {radios('primaryBeneficiary', primaryBeneficiary, setPrimaryBeneficiary, [
                ['central', 'Central'], ['shared', 'Both substantially'],
                ['outside', 'Outside party'], ['unclear', 'Not sure'],
              ])}
              {err('primaryBeneficiary')}
            </fieldset>

            <fieldset className="field">
              <span className="legend">Who primarily pays?<span className="req">*</span></span>
              {radios('primaryPayer', primaryPayer, setPrimaryPayer, [
                ['central', 'Central'], ['shared', 'Split'],
                ['outside', 'Outside party'], ['unclear', 'Not sure'],
              ])}
              {err('primaryPayer')}
            </fieldset>

            <fieldset className="field">
              <span className="legend">
                Would this event happen without Central College&rsquo;s involvement?
                <span className="req">*</span>
              </span>
              {radios('wouldOccurWithout', wouldOccurWithout, setWouldOccurWithout,
                [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']])}
              {err('wouldOccurWithout')}
            </fieldset>

            <div className="field">
              <label htmlFor="requesterNotes">Anything else we should know?</label>
              <p className="sub">Context that might affect how this is classified.</p>
              <textarea id="requesterNotes" value={requesterNotes}
                onChange={e => setRequesterNotes(e.target.value)} />
            </div>

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(2)}>Back</button>
              <button className="btn btn-primary" onClick={() => go(4)}>Review your request</button>
            </div>
          </section>
        )}

        {/* ---------- review ---------- */}
        {step === 4 && (
          <section className="card">
            <span className="eyebrow">Review</span>
            <h2>Review your request</h2>
            <p className="hint">
              Check everything over. Once you submit, the events office reviews
              your request and confirms the classification — you will hear back
              before anything is booked.
            </p>

            {submitError && <div className="alert alert-error">{submitError}</div>}

            <ReviewGroup title="Event details" onEdit={() => go(0)} rows={[
              ['Event type', selectedType?.name ?? (eventTypeOther || 'Not listed')],
              ['Department', departmentOrg],
              ['Phone', contactPhone],
              ['Event', eventName],
              ['Purpose', eventPurpose],
              ['Date', eventDate],
              ['Time', startTime && endTime ? `${startTime} – ${endTime}` : ''],
              ['Location', spaces.find(s => s.id === spaceId)?.name ?? locationFreetext],
              ['Attendance', estimatedAttendance],
            ]} />

            <ReviewGroup title="Requirements" onEdit={() => go(1)} rows={[
              ['Food and beverage', foodNeeds],
              ['Service', serviceExpectations],
              ['Dietary', dietaryRestrictions],
              ['Room setup', roomSetup],
              ['Equipment', equipment],
              ['Technology', technology],
              ['Special requests', specialRequests],
            ]} />

            <ReviewGroup title="Funding" onEdit={() => go(2)} rows={[
              ['Budget account', budgetAccount],
              ['Outside organization', outsideOrgInvolved === 'yes' ? outsideOrgName || 'Yes' : 'No'],
              ['Outside funding', PARTY_LABEL[outsideFunding] ?? ''],
              ['Revenue collected', revenueCollected === 'yes' ? `Yes — to ${revenueRecipient}` : 'No'],
              ['Financial risk', PARTY_LABEL[financialRisk] ?? ''],
            ]} />

            <ReviewGroup title="Classification answers" onEdit={() => go(3)} rows={[
              ['Official business', PARTY_LABEL[officialBusiness] ?? ''],
              ['Owned by', PARTY_LABEL[eventOwner] ?? ''],
              ['Benefits', PARTY_LABEL[primaryBeneficiary] ?? ''],
              ['Pays', PARTY_LABEL[primaryPayer] ?? ''],
              ['Happens without Central', PARTY_LABEL[wouldOccurWithout] ?? ''],
              ['Notes', requesterNotes],
            ]} />

            <div className="actions">
              <button className="btn btn-ghost" onClick={() => go(3)}>Back</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ---------- live classification ---------- */}
      <aside className="panel" aria-live="polite">
        <div className="panel-head">
          <h3>Likely classification</h3>
          <p>Updates as you answer sections C and D</p>
        </div>
        <div className="panel-body">
          {advisory.classification ? (
            <>
              <p className={`verdict ${VERDICT_CLASS[advisory.classification]}`}>
                {classificationLabel(advisory.classification)}
              </p>
              <p className="verdict-note">{advisory.rationale}</p>
              <ul className="reasons">
                {advisory.reasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          ) : (
            <>
              <p className="verdict pending">Not enough answers yet</p>
              <p className="verdict-note">
                Choose an event type, or answer the classification questions, and
                we will show you where your event is likely to land.
              </p>
            </>
          )}
          <p className="disclaimer">
            This is a preview based on your answers. The events office makes the
            final determination and may classify your event differently.
          </p>
        </div>
      </aside>
    </div>
  );
}

function ReviewGroup({
  title, rows, onEdit,
}: {
  title: string;
  rows: [string, string][];
  onEdit: () => void;
}) {
  const filled = rows.filter(([, v]) => v && v.trim());
  return (
    <div className="review-group">
      <h3>
        {title}
        <button type="button" className="edit-link" onClick={onEdit}>Edit</button>
      </h3>
      {filled.length ? (
        <dl>
          {filled.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="empty">Nothing entered</p>
      )}
    </div>
  );
}
