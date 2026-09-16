'use client';

import { KIND_LABEL, type SetupOption } from '@/lib/setup-labels';

/**
 * Picking setup, equipment and technology.
 *
 * Only what the chosen room can actually do. Offering a projector in
 * a room without one wastes everyone's time twice: once when it is
 * asked for and again when it is explained away.
 */

export interface SetupValue {
  optionId: string;
  count: number | null;
}

export default function SetupChecklist({
  options,
  values,
  onChange,
  spaceChosen,
}: {
  options: SetupOption[];
  values: SetupValue[];
  onChange: (next: SetupValue[]) => void;
  spaceChosen: boolean;
}) {
  if (!spaceChosen) {
    return (
      <p className="sub">
        Choose a location above and we will show what that room can do.
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <p className="sub">
        Nothing is set up for this room yet. Describe what you need in the
        notes below and the events office will sort it out.
      </p>
    );
  }

  const kinds = ['setup', 'equipment', 'technology'] as const;

  function toggle(o: SetupOption) {
    const has = values.some((v) => v.optionId === o.id);
    if (has) {
      onChange(values.filter((v) => v.optionId !== o.id));
    } else {
      onChange([
        ...values,
        { optionId: o.id, count: o.takes_count ? 1 : null },
      ]);
    }
  }

  function setCount(optionId: string, count: number | null) {
    onChange(
      values.map((v) => (v.optionId === optionId ? { ...v, count } : v))
    );
  }

  return (
    <div className="setup-checklists">
      {kinds.map((kind) => {
        const inKind = options.filter((o) => o.kind === kind);
        if (inKind.length === 0) return null;

        return (
          <fieldset className="setup-group" key={kind}>
            <legend>{KIND_LABEL[kind]}</legend>
            <div className="setup-options">
              {inKind.map((o) => {
                const value = values.find((v) => v.optionId === o.id);
                return (
                  <div
                    className={`setup-option${value ? ' picked' : ''}`}
                    key={o.id}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={() => toggle(o)}
                      />
                      <span>
                        <span className="setup-label">{o.label}</span>
                        {o.help_text && (
                          <span className="setup-help">{o.help_text}</span>
                        )}
                      </span>
                    </label>
                    {value && o.takes_count && (
                      <span className="setup-count">
                        <label className="sr-only" htmlFor={`c-${o.id}`}>
                          How many {o.label}
                        </label>
                        <input
                          id={`c-${o.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={o.max_count ?? undefined}
                          value={value.count ?? ''}
                          placeholder="0"
                          onChange={(e) => {
                            // Emptyable while typing; a 1 forced back
                            // on every keystroke cannot be cleared.
                            const raw = e.target.value;
                            setCount(o.id, raw === '' ? null : Number(raw));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '') setCount(o.id, 1);
                          }}
                        />
                        {o.max_count && (
                          <span className="setup-max">
                            max {o.max_count}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
