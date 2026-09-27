'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SetupChecklist, { type SetupValue } from './SetupChecklist';
import MenuChoices, { type ChoiceValue } from './MenuChoices';
import type { SetupOption } from '@/lib/setup-labels';
import type { ChoiceGroup } from '@/lib/choices';

/**
 * Asking for an event.
 *
 * One page. The classification questions are gone: a department
 * secretary booking a lunch should not have to work out who the
 * primary beneficiary is, and their guess was never what staff
 * recorded anyway. Staff read the description and the funding and
 * decide.
 *
 * The menu is here too, for anyone who already knows. Prices shown
 * are the standard rate until the event is classified, which is said
 * plainly rather than discovered later.
 */

interface SpaceOption {
  id: string;
  name: string;
  building: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  supports_catering: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unit_price: string;
  minimum_quantity: number | null;
}

interface EventType {
  id: string;
  name: string;
  guidance: string | null;
}

interface CatererOption {
  id: string;
  business_name: string;
  cuisine_notes: string | null;
  insurance_lapsed: boolean;
  license_lapsed: boolean;
}

/**
 * More than one may apply. Central doing dessert while a caterer does
 * the main is one event with two food sources, and the facility
 * charge rules are written in exactly those terms.
 */
const FOOD_SOURCES = [
  ['central_dining', 'Central Catering', 'We cook it and serve it'],
  ['outside_caterer', 'An outside caterer', 'Someone from our approved list'],
  ['donated', 'Donated or brought in', 'A potluck, or food somebody is giving'],
] as const;

const PARTY = [
  ['central', 'Central College'],
  ['shared', 'Shared'],
  ['outside', 'An outside party'],
  ['unclear', 'Not sure'],
] as const;

export default function IntakeForm({
  spaces,
  eventTypes,
  menu,
  choiceGroups,
  caterers,
  defaultName,
  defaultOrg,
  defaultEmail,
}: {
  spaces: SpaceOption[];
  eventTypes: EventType[];
  menu: MenuItem[];
  choiceGroups: Record<string, ChoiceGroup[]>;
  /** Approved, insured and current. Anyone else has to be approved
   *  before the day, so they are named rather than picked. */
  caterers: CatererOption[];
  defaultName: string;
  defaultOrg: string | null;
  defaultEmail: string;
}) {
  const router = useRouter();

  /* ---------- who and what ---------- */
  const [requesterName, setRequesterName] = useState(defaultName);
  const [departmentOrg, setDepartmentOrg] = useState(defaultOrg ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventTypeId, setEventTypeId] = useState('');
  const [eventTypeOther, setEventTypeOther] = useState('');
  const [description, setDescription] = useState('');

  /* ---------- when and where ---------- */
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [attendance, setAttendance] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [spaceSearch, setSpaceSearch] = useState('');
  const [locationFreetext, setLocationFreetext] = useState('');

  /* ---------- food ---------- */
  const [sources, setSources] = useState<string[]>([]);
  const [noFood, setNoFood] = useState(false);
  const [catererId, setCatererId] = useState('');
  const [catererName, setCatererName] = useState('');
  // Who covers what. Only asked when more than one is providing
  // food, because that is when the facility charge becomes a
  // judgement rather than a rule.
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [menuNow, setMenuNow] = useState<boolean | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [choices, setChoices] = useState<Record<string, ChoiceValue[]>>({});
  const [dietary, setDietary] = useState('');

  /* ---------- setup ---------- */
  const [setupOptions, setSetupOptions] = useState<SetupOption[]>([]);
  const [setupValues, setSetupValues] = useState<SetupValue[]>([]);
  const [setupNotes, setSetupNotes] = useState('');

  /* ---------- money ---------- */
  const [budgetAccount, setBudgetAccount] = useState('');
  const [outsideOrgName, setOutsideOrgName] = useState('');
  const [outsideFunding, setOutsideFunding] = useState('');
  const [outsideFundingDetail, setOutsideFundingDetail] = useState('');
  const [revenueCollected, setRevenueCollected] = useState('');
  const [revenueRecipient, setRevenueRecipient] = useState('');
  const [financialRisk, setFinancialRisk] = useState('');

  /* ---------- short notice ---------- */
  const [notice, setNotice] = useState<{
    isShort: boolean;
    hoursNotice: number;
    requiredHours: number;
    spaceName: string;
  } | null>(null);
  const [noticeReason, setNoticeReason] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const err = (key: string) =>
    errors[key] ? <span className="err">{errors[key]}</span> : null;

  /* ---------- the room decides the checklist ---------- */
  useEffect(() => {
    if (!spaceId || spaceId === 'other') {
      setSetupOptions([]);
      setSetupValues([]);
      return;
    }
    let cancelled = false;
    fetch('/api/requests/space-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSetupOptions(d.options ?? []);
        setSetupValues([]);
      })
      .catch(() => {
        if (!cancelled) setSetupOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  /* ---------- short notice ---------- */
  useEffect(() => {
    if (!spaceId || spaceId === 'other' || !eventDate) {
      setNotice(null);
      return;
    }
    let cancelled = false;
    fetch('/api/requests/notice-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spaceId,
        date: eventDate,
        time: startTime || null,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNotice(d.isShort ? d : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spaceId, eventDate, startTime]);

  /* ---------- the room list ---------- */
  const matchingSpaces = spaces.filter((s) => {
    if (!spaceSearch.trim()) return true;
    const q = spaceSearch.toLowerCase();
    return `${s.name} ${s.building ?? ''}`.toLowerCase().includes(q);
  });

  const chosenSpace = spaces.find((s) => s.id === spaceId);

  const overCapacity = useMemo(() => {
    if (!chosenSpace || !attendance) return false;
    const cap =
      chosenSpace.capacity_standing ?? chosenSpace.capacity_seated ?? 0;
    return cap > 0 && Number(attendance) > cap;
  }, [chosenSpace, attendance]);

  /* ---------- the menu ---------- */
  const wantsCentral = sources.includes('central_dining');
  const wantsCaterer = sources.includes('outside_caterer');
  const wantsDonated = sources.includes('donated');
  const isSplit = sources.length > 1;

  function toggleSource(kind: string) {
    setNoFood(false);
    setSources((s) =>
      s.includes(kind) ? s.filter((x) => x !== kind) : [...s, kind]
    );
  }
  const chosen = menu.filter((m) => (quantities[m.id] ?? 0) > 0);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const m of menu) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()];
  }, [menu]);

  function unitPrice(m: MenuItem) {
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

  const estimate = chosen.reduce(
    (sum, m) => sum + unitPrice(m) * quantities[m.id],
    0
  );

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

  const money = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  /* ---------- submitting ---------- */

  function validate() {
    const e: Record<string, string> = {};
    if (!requesterName.trim()) e.requesterName = 'We need your name.';
    if (!departmentOrg.trim())
      e.departmentOrg = 'Which department or organization?';
    if (!eventName.trim()) e.eventName = 'Give your event a name.';
    if (!eventTypeId && !eventTypeOther.trim())
      e.eventType = 'Choose the closest type, or describe it.';
    if (!eventDate) e.eventDate = 'When is it?';
    if (!attendance || Number(attendance) < 1)
      e.attendance = 'Roughly how many people?';
    if (!spaceId) e.spaceId = 'Where would you like it?';
    if (spaceId === 'other' && !locationFreetext.trim())
      e.locationFreetext = 'Tell us roughly where.';
    if (sources.length === 0 && !noFood)
      e.foodSource = 'Choose at least one, or "no food at all".';
    if (wantsCaterer && !catererId && !catererName.trim())
      e.catererName = 'Choose a caterer, or tell us who you have in mind.';
    if (catererId === 'other' && !catererName.trim())
      e.catererName = 'Who do you have in mind?';
    if (!financialRisk) e.financialRisk = 'Choose one.';
    if (incomplete.length > 0)
      e.menu = `Still to choose: ${incomplete.map((m) => m.name).join(', ')}.`;

    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector('.err');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName: requesterName.trim(),
          departmentOrg: departmentOrg.trim(),
          contactPhone: contactPhone.trim() || null,
          eventName: eventName.trim(),
          eventTypeId: eventTypeId || null,
          eventTypeOther: eventTypeOther.trim() || null,
          eventDescription: description.trim() || null,
          eventDate,
          startTime: startTime || null,
          endTime: endTime || null,
          spaceId: spaceId === 'other' ? null : spaceId,
          locationFreetext: locationFreetext.trim() || null,
          estimatedAttendance: Number(attendance),

          foodSources: noFood
            ? [{ kind: 'no_food', covers: null }]
            : sources.map((kind) => ({
                kind,
                covers: covers[kind]?.trim() || null,
              })),
          catererId:
            catererId && catererId !== 'other' ? catererId : null,
          catererName: catererName.trim() || null,
          dietaryRestrictions: dietary.trim() || null,

          menuSelections: wantsCentral
            ? chosen.map((m) => ({
                menuItemId: m.id,
                quantity: quantities[m.id],
                choices: (choices[m.id] ?? []).map((v) => ({
                  optionId: v.optionId,
                  quantity: v.quantity,
                })),
              }))
            : [],

          setupSelections: setupValues.map((v) => ({
            optionId: v.optionId,
            count: v.count,
          })),
          setupNotes: setupNotes.trim() || null,

          funding: {
            budgetAccount: budgetAccount.trim() || null,
            outsideOrgName: outsideOrgName.trim() || null,
            outsideFunding: outsideFunding === 'yes',
            outsideFundingDetail: outsideFundingDetail.trim() || null,
            revenueCollected: revenueCollected === 'yes',
            revenueRecipient: revenueRecipient.trim() || null,
            financialRiskBearer: financialRisk,
          },

          shortNotice: !!notice?.isShort,
          shortNoticeReason: notice?.isShort
            ? noticeReason.trim() || null
            : null,

          // Everything given at once: no coming back for a menu they
          // have already chosen.
          submittedComplete: !wantsCentral || chosen.length > 0,
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        setSubmitError(d.error ?? 'Something went wrong. Please try again.');
        setBusy(false);
        return;
      }
      router.push(`/my-requests/${d.id}?new=1`);
    } catch {
      setSubmitError('Could not reach the server. Please try again.');
      setBusy(false);
    }
  }

  const radios = (
    name: string,
    value: string,
    onChange: (v: string) => void,
    options: readonly (readonly [string, string])[]
  ) => (
    <div className="choices" role="radiogroup">
      {options.map(([v, label]) => (
        <label className="choice" key={v}>
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
          />
          {label}
        </label>
      ))}
    </div>
  );

  return (
    <div className="intake">
      {/* ============ your event ============ */}
      <section className="intake-block">
        <h2>Your event</h2>

        <div className="grid two">
          <div className="field">
            <label htmlFor="if-name">
              Your name<span className="req">*</span>
            </label>
            <input
              id="if-name"
              type="text"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
            />
            {err('requesterName')}
          </div>
          <div className="field">
            <label htmlFor="if-dept">
              Department or organization<span className="req">*</span>
            </label>
            <input
              id="if-dept"
              type="text"
              value={departmentOrg}
              onChange={(e) => setDepartmentOrg(e.target.value)}
            />
            {err('departmentOrg')}
          </div>
          <div className="field">
            <label htmlFor="if-phone">Phone</label>
            <p className="sub">For anything urgent on the day.</p>
            <input
              id="if-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Email</label>
            <p className="sub" style={{ marginTop: '.55rem' }}>
              {defaultEmail}
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="if-event">
            What is it called?<span className="req">*</span>
          </label>
          <p className="sub">
            How people would refer to it. &ldquo;Chemistry seminar
            lunch&rdquo;, &ldquo;Anderson wedding&rdquo;.
          </p>
          <input
            id="if-event"
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
          {err('eventName')}
        </div>

        <div className="field">
          <label htmlFor="if-type">
            Closest type<span className="req">*</span>
          </label>
          <select
            id="if-type"
            value={eventTypeId}
            onChange={(e) => {
              setEventTypeId(e.target.value);
              if (e.target.value) setEventTypeOther('');
            }}
          >
            <option value="">Choose one</option>
            {eventTypes.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
            <option value="">Something else</option>
          </select>
          {!eventTypeId && (
            <input
              type="text"
              placeholder="Describe it in a few words"
              value={eventTypeOther}
              onChange={(e) => setEventTypeOther(e.target.value)}
              style={{ marginTop: '.5rem' }}
            />
          )}
          {err('eventType')}
        </div>

        <div className="field">
          <label htmlFor="if-desc">Tell us about it</label>
          <p className="sub">
            What is happening, who is coming, and anything that would help us
            understand it. This is what the events office reads when working
            out how your event is classified, so a sentence or two here saves
            a phone call later.
          </p>
          <textarea
            id="if-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      {/* ============ when and where ============ */}
      <section className="intake-block">
        <h2>When and where</h2>

        <div className="grid two">
          <div className="field">
            <label htmlFor="if-date">
              Date<span className="req">*</span>
            </label>
            <input
              id="if-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            {err('eventDate')}
          </div>
          <div className="field">
            <label htmlFor="if-count">
              How many people<span className="req">*</span>
            </label>
            <p className="sub">An estimate is fine for now.</p>
            <input
              id="if-count"
              type="number"
              inputMode="numeric"
              min={1}
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
            />
            {err('attendance')}
          </div>
          <div className="field">
            <label htmlFor="if-start">Starts</label>
            <input
              id="if-start"
              type="time"
              step={1800}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="if-end">Ends</label>
            <input
              id="if-end"
              type="time"
              step={1800}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="if-space">
            Where<span className="req">*</span>
          </label>
          <p className="sub">Start typing to narrow the list.</p>
          <input
            id="if-space"
            type="search"
            placeholder="Vermeer, Maytag, chapel..."
            value={spaceSearch}
            onChange={(e) => setSpaceSearch(e.target.value)}
            autoComplete="off"
          />

          {spaceId && spaceId !== 'other' && (
            <div className="chosen-space">
              <span>
                <strong>{chosenSpace?.name}</strong>
                {chosenSpace?.building ? ` — ${chosenSpace.building}` : ''}
              </span>
              <button
                type="button"
                className="edit-link"
                onClick={() => {
                  setSpaceId('');
                  setSpaceSearch('');
                }}
              >
                Change
              </button>
            </div>
          )}

          {(!spaceId || spaceId === 'other') && (
            <ul className="space-options">
              {matchingSpaces.length === 0 && (
                <li className="space-none">
                  Nothing matches &ldquo;{spaceSearch}&rdquo;.
                </li>
              )}
              {matchingSpaces.slice(0, 40).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="space-option"
                    onClick={() => {
                      setSpaceId(s.id);
                      setSpaceSearch('');
                    }}
                  >
                    <span className="space-option-name">{s.name}</span>
                    <span className="space-option-meta">
                      {s.building}
                      {s.capacity_seated
                        ? ` · seats ${s.capacity_seated}`
                        : ''}
                    </span>
                  </button>
                </li>
              ))}
              {matchingSpaces.length > 40 && (
                <li className="space-none">
                  {matchingSpaces.length - 40} more. Keep typing to narrow it.
                </li>
              )}
              <li>
                <button
                  type="button"
                  className={`space-option other${
                    spaceId === 'other' ? ' picked' : ''
                  }`}
                  onClick={() => setSpaceId('other')}
                >
                  <span className="space-option-name">
                    Somewhere else, or not sure
                  </span>
                  <span className="space-option-meta">
                    Describe it and we will suggest something
                  </span>
                </button>
              </li>
            </ul>
          )}
          {err('spaceId')}

          {spaceId === 'other' && (
            <div className="conditional on">
              <label htmlFor="if-where">Roughly where?</label>
              <input
                id="if-where"
                type="text"
                value={locationFreetext}
                onChange={(e) => setLocationFreetext(e.target.value)}
              />
              {err('locationFreetext')}
            </div>
          )}

          {overCapacity && (
            <div className="callout c-warn">
              <strong>That is more people than the room holds</strong>
              {chosenSpace?.name} takes about{' '}
              {chosenSpace?.capacity_standing ?? chosenSpace?.capacity_seated}.
              You can still ask, and we will suggest somewhere that fits.
            </div>
          )}

          {notice?.isShort && (
            <div className="notice-warning">
              <strong>
                {notice.hoursNotice < 0
                  ? 'That date has already passed'
                  : `That is ${Math.round(notice.hoursNotice)} hours away`}
              </strong>
              <p>
                {notice.spaceName} normally needs {notice.requiredHours}{' '}
                hours&rsquo; notice. You can still send this, but it goes to
                the events office first and they will say whether it can go
                ahead.
              </p>
              <div className="field">
                <label htmlFor="if-notice">Anything they should know?</label>
                <textarea
                  id="if-notice"
                  rows={2}
                  value={noticeReason}
                  onChange={(e) => setNoticeReason(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============ food ============ */}
      <section className="intake-block">
        <h2>Food and drink</h2>

        <fieldset className="field">
          <span className="legend">
            Who is providing it?<span className="req">*</span>
          </span>
          <p className="sub">
            Choose as many as apply. Central doing dessert while a caterer
            does the main is perfectly normal.
          </p>
          <div className="food-choices">
            {FOOD_SOURCES.map(([v, label, hint]) => (
              <label
                className={`food-choice${sources.includes(v) ? ' picked' : ''}`}
                key={v}
              >
                <input
                  type="checkbox"
                  checked={sources.includes(v)}
                  onChange={() => toggleSource(v)}
                />
                <span>
                  <span className="food-label">{label}</span>
                  <span className="food-hint">{hint}</span>
                </span>
              </label>
            ))}
            <label className={`food-choice${noFood ? ' picked' : ''}`}>
              <input
                type="checkbox"
                checked={noFood}
                onChange={() => {
                  // Nothing at all is the one that cannot be combined.
                  setNoFood((v) => !v);
                  setSources([]);
                }}
              />
              <span>
                <span className="food-label">No food at all</span>
                <span className="food-hint">Just the room</span>
              </span>
            </label>
          </div>
          {err('foodSource')}
        </fieldset>

        {isSplit && (
          <div className="callout c-default">
            <strong>More than one provider</strong>
            Tell us roughly who is doing which part below. It decides whether
            the room is charged, which is a judgement for your event rather
            than a rule, so what you write saves us asking.
          </div>
        )}

        {wantsCaterer && (
          <div className="source-block">
            <h3>The outside caterer</h3>
            <div className="field">
              <label htmlFor="if-caterer">Which caterer?</label>
              <p className="sub">
                These are approved to work on campus, which means their
                license and insurance are current and they know our kitchens
                and loading arrangements.{' '}
                <Link href="/info/outside-caterer-policy">
                  What approval involves
                </Link>
              </p>

              {caterers.length === 0 ? (
                <p className="sub">
                  No caterers are currently approved. Name who you have in
                  mind below and we will start the approval, which takes three
                  to four weeks.
                </p>
              ) : (
                <select
                  id="if-caterer"
                  value={catererId}
                  onChange={(e) => {
                    setCatererId(e.target.value);
                    if (e.target.value !== 'other') setCatererName('');
                  }}
                >
                  <option value="">Choose one</option>
                  {caterers.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.business_name}
                      {c.cuisine_notes ? ` — ${c.cuisine_notes}` : ''}
                    </option>
                  ))}
                  <option value="other">Someone else, not on this list</option>
                </select>
              )}

              {(catererId === 'other' || caterers.length === 0) && (
                <div className="conditional on">
                  <label htmlFor="if-caterer-other">
                    Who do you have in mind?
                  </label>
                  <p className="sub">
                    They will need approving before the day. Allow three to
                    four weeks, and tell us as early as you can.
                  </p>
                  <input
                    id="if-caterer-other"
                    type="text"
                    value={catererName}
                    onChange={(e) => setCatererName(e.target.value)}
                  />
                </div>
              )}
              {err('catererName')}
            </div>

            {isSplit && (
              <div className="field">
                <label htmlFor="cov-caterer">What are they providing?</label>
                <input
                  id="cov-caterer"
                  type="text"
                  placeholder="The main meal"
                  value={covers.outside_caterer ?? ''}
                  onChange={(e) =>
                    setCovers({ ...covers, outside_caterer: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        )}

        {wantsDonated && (
          <div className="source-block">
            <h3>Food being brought in</h3>
            <div className="callout c-warn">
              <strong>Donated food has rules</strong>
              Mostly about temperature and labelling, and they are not
              onerous.{' '}
              <Link href="/info/donated-food-policy">Read them</Link> before
              the day, and we will go through them with you.
            </div>
            <div className="field">
              <label htmlFor="cov-donated">
                What is being brought, and by whom?
              </label>
              <p className="sub">
                Whether it is shop-bought or made at home matters, so say
                which if you know.
              </p>
              <input
                id="cov-donated"
                type="text"
                placeholder="Departmental potluck, mostly home-made"
                value={covers.donated ?? ''}
                onChange={(e) =>
                  setCovers({ ...covers, donated: e.target.value })
                }
              />
            </div>
          </div>
        )}

        {wantsCentral && (
          <div className="source-block">
            <h3>{isSplit ? 'What Central Catering provides' : 'Your menu'}</h3>

            {isSplit && (
              <div className="field">
                <label htmlFor="cov-central">
                  What are we providing?
                </label>
                <input
                  id="cov-central"
                  type="text"
                  placeholder="Dessert and coffee"
                  value={covers.central_dining ?? ''}
                  onChange={(e) =>
                    setCovers({ ...covers, central_dining: e.target.value })
                  }
                />
              </div>
            )}

            <fieldset className="field">
              <span className="legend">
                {isSplit
                  ? 'Do you know what you want from us?'
                  : 'Do you know what you want?'}
              </span>
              <div className="choices" role="radiogroup">
                <label className="choice">
                  <input
                    type="radio"
                    name="menuNow"
                    checked={menuNow === true}
                    onChange={() => setMenuNow(true)}
                  />
                  Yes, let me choose now
                </label>
                <label className="choice">
                  <input
                    type="radio"
                    name="menuNow"
                    checked={menuNow === false}
                    onChange={() => setMenuNow(false)}
                  />
                  Not yet, we will decide later
                </label>
              </div>
            </fieldset>

            {menuNow === false && (
              <p className="sub">
                That is fine. We will confirm your classification first, then
                open the menu at your rate.
              </p>
            )}

            {menuNow === true && (
              <>
                <div className="callout c-default">
                  <strong>Prices here are the standard rate</strong>
                  Central departments and affiliated events pay less. We will
                  confirm which applies to you and the total will change
                  accordingly &mdash; nothing is charged until you have seen
                  the final figure.
                </div>

                <nav className="menu-jump" aria-label="Jump to a section">
                  {grouped.map(([category]) => (
                    <a
                      href={`#in-${category.replace(/\s+/g, '-').toLowerCase()}`}
                      key={category}
                    >
                      {category}
                      {chosen.some((m) => m.category === category) && (
                        <span className="jump-dot" />
                      )}
                    </a>
                  ))}
                </nav>

                {grouped.map(([category, items]) => (
                  <div
                    className="menu-group"
                    key={category}
                    id={`in-${category.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <h3>{category}</h3>
                    {items.map((m) => {
                      const qty = quantities[m.id] ?? 0;
                      return (
                        <div
                          className={`menu-row${qty > 0 ? ' chosen' : ''}`}
                          key={m.id}
                        >
                          <div className="menu-info">
                            <span className="menu-name">{m.name}</span>
                            {m.description && (
                              <span className="menu-desc">{m.description}</span>
                            )}
                            <span className="menu-price">
                              {money(Number(m.unit_price))} {m.unit}
                              {m.minimum_quantity
                                ? ` · minimum ${m.minimum_quantity}`
                                : ''}
                            </span>
                          </div>
                          <div className="menu-qty">
                            <label className="sr-only" htmlFor={`q-${m.id}`}>
                              Quantity of {m.name}
                            </label>
                            <input
                              id={`q-${m.id}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={qty || ''}
                              placeholder="0"
                              onChange={(e) =>
                                setQuantities({
                                  ...quantities,
                                  [m.id]: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>

                          {qty > 0 &&
                            (choiceGroups[m.id]?.length ?? 0) > 0 && (
                              <MenuChoices
                                groups={choiceGroups[m.id]}
                                values={choices[m.id] ?? []}
                                orderedQuantity={qty}
                                onChange={(next) =>
                                  setChoices((c) => ({ ...c, [m.id]: next }))
                                }
                              />
                            )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {chosen.length > 0 && (
                  <div className="estimate-total">
                    <span>Estimated at the standard rate</span>
                    <strong>{money(estimate)}</strong>
                  </div>
                )}
                {err('menu')}
              </>
            )}
          </div>
        )}

        {sources.length > 0 && (
          <div className="field">
            <label htmlFor="if-diet">Dietary requirements</label>
            <p className="sub">
              Allergies, intolerances, anything we should plan around. Five
              business days&rsquo; notice for anything unusual.
            </p>
            <textarea
              id="if-diet"
              rows={2}
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
            />
          </div>
        )}
      </section>

      {/* ============ the room ============ */}
      <section className="intake-block">
        <h2>How the room should look</h2>

        <SetupChecklist
          options={setupOptions}
          values={setupValues}
          onChange={setSetupValues}
          spaceChosen={!!spaceId && spaceId !== 'other'}
        />

        <div className="field" style={{ marginTop: '1.25rem' }}>
          <label htmlFor="if-setup">Anything else about the setup</label>
          <textarea
            id="if-setup"
            rows={2}
            value={setupNotes}
            onChange={(e) => setSetupNotes(e.target.value)}
          />
        </div>
      </section>

      {/* ============ money ============ */}
      <section className="intake-block">
        <h2>How it is being paid for</h2>
        <p className="block-note">
          These answers decide how your event is classified, and therefore what
          it costs. &ldquo;Not sure&rdquo; is a real answer.
        </p>

        <div className="field">
          <label htmlFor="if-budget">Budget account</label>
          <p className="sub">If a Central account is paying.</p>
          <input
            id="if-budget"
            type="text"
            value={budgetAccount}
            onChange={(e) => setBudgetAccount(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="if-org">Outside organization involved</label>
          <p className="sub">
            Any group, business or partner that is not part of Central. Leave
            blank if there is none.
          </p>
          <input
            id="if-org"
            type="text"
            value={outsideOrgName}
            onChange={(e) => setOutsideOrgName(e.target.value)}
          />
        </div>

        <fieldset className="field">
          <span className="legend">Is anyone outside Central paying toward it?</span>
          {radios('outsideFunding', outsideFunding, setOutsideFunding, [
            ['yes', 'Yes'],
            ['no', 'No'],
          ])}
          {outsideFunding === 'yes' && (
            <div className="conditional on">
              <label htmlFor="if-fund">Who, and how much?</label>
              <input
                id="if-fund"
                type="text"
                value={outsideFundingDetail}
                onChange={(e) => setOutsideFundingDetail(e.target.value)}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="field">
          <span className="legend">
            Are you charging admission or collecting money?
          </span>
          {radios('revenueCollected', revenueCollected, setRevenueCollected, [
            ['yes', 'Yes'],
            ['no', 'No'],
          ])}
          {revenueCollected === 'yes' && (
            <div className="conditional on">
              <label htmlFor="if-rev">Who receives it?</label>
              <input
                id="if-rev"
                type="text"
                value={revenueRecipient}
                onChange={(e) => setRevenueRecipient(e.target.value)}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="field">
          <span className="legend">
            If it lost money, who would carry that?<span className="req">*</span>
          </span>
          {radios('financialRisk', financialRisk, setFinancialRisk, PARTY)}
          {err('financialRisk')}
        </fieldset>
      </section>

      {/* ============ send ============ */}
      {submitError && <div className="alert alert-error">{submitError}</div>}

      <div className="intake-send">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Sending...' : 'Send this to the events office'}
        </button>
        <p className="sub">
          You will hear back within two working days. Nothing is booked or
          charged until you have seen and confirmed the details.
        </p>
      </div>
    </div>
  );
}
