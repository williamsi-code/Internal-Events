'use client';

import type { ChoiceGroup } from '@/lib/choices';

/**
 * The choices for one menu item.
 *
 * Three shapes, because the menu has three shapes. One-of is a set of
 * radio buttons. Several-of is checkboxes with a limit. Several-of
 * with quantities is checkboxes plus a number, which is what the
 * boxed sandwiches and the soups need.
 */

export interface ChoiceValue {
  optionId: string;
  quantity: number | null;
}

export default function MenuChoices({
  groups,
  values,
  onChange,
  disabled,
  orderedQuantity,
}: {
  groups: ChoiceGroup[];
  values: ChoiceValue[];
  onChange: (next: ChoiceValue[]) => void;
  disabled?: boolean;
  /** How many of the item were ordered. A split should add up to it;
   *  this says so rather than refusing the entry. */
  orderedQuantity?: number;
}) {
  if (groups.length === 0) return null;

  const chosenIn = (g: ChoiceGroup) =>
    values.filter((v) => g.options.some((o) => o.id === v.optionId));

  function setSingle(g: ChoiceGroup, optionId: string) {
    const others = values.filter(
      (v) => !g.options.some((o) => o.id === v.optionId)
    );
    onChange([...others, { optionId, quantity: null }]);
  }

  function toggle(g: ChoiceGroup, optionId: string) {
    const has = values.some((v) => v.optionId === optionId);
    if (has) {
      onChange(values.filter((v) => v.optionId !== optionId));
      return;
    }
    // At the limit, the oldest choice in this group gives way rather
    // than the click doing nothing.
    const inGroup = chosenIn(g);
    let next = values;
    if (inGroup.length >= g.max_select) {
      next = values.filter((v) => v.optionId !== inGroup[0].optionId);
    }
    onChange([
      ...next,
      { optionId, quantity: g.quantity_mode === 'per_option' ? 1 : null },
    ]);
  }

  function setQuantity(optionId: string, quantity: number) {
    onChange(
      values.map((v) => (v.optionId === optionId ? { ...v, quantity } : v))
    );
  }

  return (
    <div className="choice-groups">
      {groups.map((g) => {
        const chosen = chosenIn(g);
        const single = g.max_select === 1 && g.min_select === 1;
        const short = chosen.length < g.min_select;

        return (
          <fieldset className="choice-group" key={g.id} disabled={disabled}>
            <legend>
              {g.label}
              {g.min_select > 0 && <span className="req">*</span>}
              {short && chosen.length > 0 && (
                <span className="choice-short">
                  choose {g.min_select - chosen.length} more
                </span>
              )}
            </legend>
            {g.help_text && <p className="sub">{g.help_text}</p>}

            {single ? (
              <div className="choice-radios">
                {g.options.map((o) => (
                  <label className="choice-radio" key={o.id}>
                    <input
                      type="radio"
                      name={`group-${g.id}`}
                      checked={values.some((v) => v.optionId === o.id)}
                      onChange={() => setSingle(g, o.id)}
                    />
                    <span>
                      {o.label}
                      {Number(o.price_delta) > 0 && (
                        <span className="choice-delta">
                          {' +$'}
                          {Number(o.price_delta).toFixed(2)}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="choice-checks">
                {g.options.map((o) => {
                  const value = values.find((v) => v.optionId === o.id);
                  const atLimit =
                    !value && chosen.length >= g.max_select;
                  return (
                    <div className="choice-check" key={o.id}>
                      <label className={atLimit ? 'at-limit' : ''}>
                        <input
                          type="checkbox"
                          checked={!!value}
                          onChange={() => toggle(g, o.id)}
                        />
                        <span>
                          {o.label}
                          {Number(o.price_delta) > 0 && (
                            <span className="choice-delta">
                              {' +$'}
                              {Number(o.price_delta).toFixed(2)}
                            </span>
                          )}
                        </span>
                      </label>
                      {value && g.quantity_mode === 'per_option' && (
                        <input
                          type="number"
                          className="choice-qty"
                          min={1}
                          value={value.quantity ?? 1}
                          onChange={(e) =>
                            setQuantity(o.id, Number(e.target.value) || 1)
                          }
                          aria-label={`How many ${o.label}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {g.max_select > 1 && g.quantity_mode !== 'per_option' && (
              <p className="choice-count">
                {chosen.length} of {g.max_select} chosen
              </p>
            )}

            {g.quantity_mode === 'per_option' && chosen.length > 0 && (
              (() => {
                const allocated = chosen.reduce(
                  (sum, v) => sum + (v.quantity ?? 0),
                  0
                );
                if (!orderedQuantity) {
                  return (
                    <p className="choice-count">
                      {allocated} allocated across {chosen.length}{' '}
                      {chosen.length === 1 ? 'choice' : 'choices'}
                    </p>
                  );
                }
                const diff = orderedQuantity - allocated;
                return (
                  <p
                    className={`choice-count${diff !== 0 ? ' mismatch' : ' ok'}`}
                  >
                    {diff === 0
                      ? `${allocated} of ${orderedQuantity} \u2014 that adds up`
                      : diff > 0
                        ? `${allocated} of ${orderedQuantity} \u2014 ${diff} still to allocate`
                        : `${allocated} of ${orderedQuantity} \u2014 ${-diff} too many`}
                  </p>
                );
              })()
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
