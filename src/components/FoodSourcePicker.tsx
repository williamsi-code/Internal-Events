'use client';

import Link from 'next/link';
import type { ApprovedCaterer } from '@/lib/caterers';

export interface FoodSource {
  kind: 'central_dining' | 'outside_caterer' | 'donated' | 'no_food';
  catererId: string;
  catererOther: string;
  covers: string;
}

const OPTIONS: [FoodSource['kind'], string, string][] = [
  [
    'central_dining',
    'Central Catering',
    'We cook and serve. This is the usual arrangement.',
  ],
  [
    'outside_caterer',
    'An approved outside caterer',
    'A catering business from our approved list brings the food.',
  ],
  [
    'donated',
    'Food is being donated',
    'Donated food arriving from outside campus.',
  ],
  ['no_food', 'No food at this event', 'Space only.'],
];

export default function FoodSourcePicker({
  sources,
  setSources,
  caterers,
  error,
}: {
  sources: FoodSource[];
  setSources: (s: FoodSource[]) => void;
  caterers: ApprovedCaterer[];
  error?: string;
}) {
  const has = (kind: FoodSource['kind']) =>
    sources.some((s) => s.kind === kind);

  function toggle(kind: FoodSource['kind']) {
    if (has(kind)) {
      setSources(sources.filter((s) => s.kind !== kind));
      return;
    }
    // No food is exclusive: it cannot be true alongside anything else.
    if (kind === 'no_food') {
      setSources([{ kind, catererId: '', catererOther: '', covers: '' }]);
      return;
    }
    const withoutNone = sources.filter((s) => s.kind !== 'no_food');
    setSources([
      ...withoutNone,
      { kind, catererId: '', catererOther: '', covers: '' },
    ]);
  }

  function update(kind: FoodSource['kind'], patch: Partial<FoodSource>) {
    setSources(
      sources.map((s) => (s.kind === kind ? { ...s, ...patch } : s))
    );
  }

  const source = (kind: FoodSource['kind']) =>
    sources.find((s) => s.kind === kind);

  const split =
    has('central_dining') && (has('outside_caterer') || has('donated'));

  return (
    <div className="field">
      <span className="legend">
        Who is providing the food?<span className="req">*</span>
      </span>
      <p className="sub">
        Choose everything that applies. Some events are split &mdash; Central
        Dining for the reception, an outside caterer for dessert.
      </p>

      <div className="food-options">
        {OPTIONS.map(([kind, label, hint]) => (
          <label className="food-option" key={kind}>
            <input
              type="checkbox"
              checked={has(kind)}
              onChange={() => toggle(kind)}
            />
            <span>
              <span className="food-label">{label}</span>
              <span className="food-hint">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="err on">{error}</p>}

      {has('outside_caterer') && (
        <div className="conditional on">
          <div className="field">
            <label htmlFor="caterer-id">Which caterer?</label>
            {caterers.length === 0 ? (
              <p className="sub" style={{ color: 'var(--brass)' }}>
                No caterers are currently approved. Tell us who you have in mind
                below and the events office will follow up &mdash; they will need
                to be approved before the event.
              </p>
            ) : (
              <select
                id="caterer-id"
                value={source('outside_caterer')?.catererId ?? ''}
                onChange={(e) =>
                  update('outside_caterer', { catererId: e.target.value })
                }
              >
                <option value="">Choose a caterer</option>
                {caterers.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.business_name}
                  </option>
                ))}
                <option value="other">Not on this list</option>
              </select>
            )}
          </div>

          {(caterers.length === 0 ||
            source('outside_caterer')?.catererId === 'other') && (
            <div className="field">
              <label htmlFor="caterer-other">Who did you have in mind?</label>
              <p className="sub">
                Only approved caterers may serve on campus, so this may add time
                while they apply.
              </p>
              <input
                id="caterer-other"
                type="text"
                value={source('outside_caterer')?.catererOther ?? ''}
                onChange={(e) =>
                  update('outside_caterer', { catererOther: e.target.value })
                }
              />
            </div>
          )}

          {split && (
            <div className="field">
              <label htmlFor="caterer-covers">What are they covering?</label>
              <p className="sub">
                For example: dessert only, or the evening reception.
              </p>
              <input
                id="caterer-covers"
                type="text"
                value={source('outside_caterer')?.covers ?? ''}
                onChange={(e) =>
                  update('outside_caterer', { covers: e.target.value })
                }
              />
            </div>
          )}

          <p className="sub">
            <Link href="/info/outside-caterer-policy" target="_blank">
              Outside caterer requirements
            </Link>{' '}
            &mdash; your department sponsors and is accountable for the caterer.
          </p>
        </div>
      )}

      {has('donated') && (
        <div className="conditional on">
          <div className="field">
            <label htmlFor="donated-from">Where is the food coming from?</label>
            <p className="sub">
              Name the business, organization, or person providing it.
            </p>
            <input
              id="donated-from"
              type="text"
              value={source('donated')?.catererOther ?? ''}
              onChange={(e) =>
                update('donated', { catererOther: e.target.value })
              }
            />
          </div>

          {split && (
            <div className="field">
              <label htmlFor="donated-covers">What are they covering?</label>
              <input
                id="donated-covers"
                type="text"
                value={source('donated')?.covers ?? ''}
                onChange={(e) => update('donated', { covers: e.target.value })}
              />
            </div>
          )}

          <p className="sub">
            <Link href="/info/donated-food-policy" target="_blank">
              Donated food requirements
            </Link>{' '}
            &mdash; food prepared off campus carries the same safety
            considerations as any outside caterer.
          </p>
        </div>
      )}

      {split && (
        <div className="callout c-default" style={{ marginTop: '1rem' }}>
          <strong>Split catering</strong>
          Central Catering will price its portion from the menu. The events office
          will confirm whether a facility charge applies to the rest.
        </div>
      )}

      {!has('central_dining') && !has('no_food') && sources.length > 0 && (
        <div className="callout c-warn" style={{ marginTop: '1rem' }}>
          <strong>Central is not providing food</strong>
          There will be no menu to choose from. A facility charge may apply
          depending on how your event is classified.
        </div>
      )}
    </div>
  );
}
