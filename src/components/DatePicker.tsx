'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Jumping to a date.
 *
 * A month grid rather than a native date input, because the useful
 * thing is seeing which days already have something on them. Dots
 * mark activity, so someone looking for a free Saturday can find one
 * without opening each week in turn.
 */

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

export default function DatePicker({
  value,
  onPick,
  busyDays,
}: {
  value: string;
  onPick: (dateIso: string) => void;
  busyDays: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date(value + 'T00:00:00');
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Follow the schedule when it moves, so opening the picker shows
  // where you already are.
  useEffect(() => {
    const d = new Date(value + 'T00:00:00');
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor.getMonth() !== month.getMonth() && cursor.getDay() === 0) break;
  }

  const todayIso = iso(new Date());
  const selected = new Date(value + 'T00:00:00');

  return (
    <div className="datepick" ref={wrapRef}>
      <button
        className="btn btn-ghost datepick-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {selected.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </button>

      {open && (
        <div className="datepick-panel" role="dialog" aria-label="Choose a date">
          <div className="datepick-head">
            <button
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              aria-label="Previous month"
            >
              &larr;
            </button>
            <span>
              {month.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              aria-label="Next month"
            >
              &rarr;
            </button>
          </div>

          <div className="datepick-grid">
            {DAYS.map((d, i) => (
              <span className="datepick-dow" key={i}>
                {d}
              </span>
            ))}
            {weeks.flat().map((d) => {
              const key = iso(d);
              const outside = d.getMonth() !== month.getMonth();
              const busy = busyDays.get(key) ?? 0;
              return (
                <button
                  key={key}
                  className={`datepick-day${outside ? ' outside' : ''}${
                    key === value ? ' selected' : ''
                  }${key === todayIso ? ' today' : ''}`}
                  onClick={() => {
                    onPick(key);
                    setOpen(false);
                  }}
                  title={busy ? `${busy} booking${busy === 1 ? '' : 's'}` : undefined}
                >
                  {d.getDate()}
                  {busy > 0 && <span className="datepick-dot" />}
                </button>
              );
            })}
          </div>

          <div className="datepick-foot">
            <button
              className="edit-link"
              onClick={() => {
                onPick(todayIso);
                setOpen(false);
              }}
            >
              Today
            </button>
            <span className="sub">A dot means something is booked</span>
          </div>
        </div>
      )}
    </div>
  );
}
