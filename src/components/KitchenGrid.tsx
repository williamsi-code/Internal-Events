'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  ProductionTask,
  ServiceWindow,
  Station,
} from '@/lib/production';

/**
 * The kitchen's day.
 *
 * Stations down the side, time across, the same shape as the room
 * scheduler so it needs no learning. Underneath it, the service work
 * that happens away from the kitchen - which is where the two
 * schedules meet and can disagree.
 *
 * Every block carries its event and opens it, because the first
 * question anyone has about a task is which event it belongs to.
 */

const DAY_START = 5;  // the bakery is in before anyone
const DAY_END = 23;
const HOUR_WIDTH = 78;

const KIND_LABEL: Record<string, string> = {
  load: 'Load the van',
  travel: 'Travel',
  setup: 'Set up',
  service: 'Service',
  teardown: 'Clear down',
  return: 'Back to the kitchen',
};

export default function KitchenGrid({
  day,
  tasks,
  windows,
  stations,
  unplanned,
}: {
  day: string;
  tasks: ProductionTask[];
  windows: ServiceWindow[];
  stations: Station[];
  unplanned: {
    id: string;
    reference_code: string;
    event_name: string;
    event_date: string;
    start_time: string | null;
    attendance: number;
    space_name: string | null;
    menu_lines: number;
  }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProductionTask | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const hours = Array.from(
    { length: DAY_END - DAY_START },
    (_, i) => DAY_START + i
  );

  const left = (minutes: number) =>
    ((minutes - DAY_START * 60) / 60) * HOUR_WIDTH;

  const width = (from: number, to: number) =>
    Math.max(((to - from) / 60) * HOUR_WIDTH, 28);

  const label = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const suffix = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
  };

  async function act(body: Record<string, unknown>, id: string) {
    setBusy(id);
    setError('');
    try {
      const res = await fetch('/api/staff/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy('');
        return;
      }
      setSelected(null);
      router.refresh();
      setBusy('');
    } catch {
      setError('Could not reach the server.');
      setBusy('');
    }
  }

  const conflicts = windows.filter((w) => w.room_conflict);

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {conflicts.length > 0 && (
        <div className="callout c-flag">
          <strong>
            {conflicts.length} catering window
            {conflicts.length === 1 ? '' : 's'} outside the room booking
          </strong>
          {conflicts
            .map(
              (c) =>
                `${KIND_LABEL[c.kind] ?? c.kind} for ${c.event_name} in ${c.space_name}`
            )
            .join('; ')}
          . Either the room needs holding longer or the catering needs to
          start later.
        </div>
      )}

      {/* ---------- the kitchen ---------- */}
      <div className="resgrid kitchen">
        <div className="resgrid-scroll">
          <div
            className="resgrid-hours"
            style={{ width: hours.length * HOUR_WIDTH }}
          >
            {hours.map((h) => (
              <span
                className="resgrid-hour"
                style={{ width: HOUR_WIDTH }}
                key={h}
              >
                {label(h * 60)}
              </span>
            ))}
          </div>

          {stations.map((s) => {
            const mine = tasks.filter((t) => t.station_id === s.id);
            return (
              <div className="resgrid-row" key={s.id}>
                <div className="resgrid-label">
                  <span className="resgrid-name">{s.name}</span>
                  <span className="resgrid-sub">
                    {mine.length
                      ? `${mine.length} task${mine.length === 1 ? '' : 's'}`
                      : 'clear'}
                  </span>
                </div>
                <div
                  className="resgrid-track"
                  style={{ width: hours.length * HOUR_WIDTH }}
                >
                  {mine.map((t) => (
                    <button
                      className={`kitchen-block ${t.state}${
                        t.no_recipe ? ' guessed' : ''
                      }`}
                      key={t.id}
                      style={{
                        left: left(t.start_minutes),
                        width: width(t.start_minutes, t.end_minutes),
                      }}
                      onClick={() => setSelected(t)}
                      title={`${t.title} \u00b7 ${t.event_name ?? ''}`}
                    >
                      <span className="kb-title">{t.title}</span>
                      <span className="kb-event">{t.event_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* tasks with no station yet */}
          {tasks.some((t) => !t.station_id) && (
            <div className="resgrid-row">
              <div className="resgrid-label">
                <span className="resgrid-name">No station</span>
                <span className="resgrid-sub">needs a home</span>
              </div>
              <div
                className="resgrid-track"
                style={{ width: hours.length * HOUR_WIDTH }}
              >
                {tasks
                  .filter((t) => !t.station_id)
                  .map((t) => (
                    <button
                      className={`kitchen-block ${t.state} unstationed`}
                      key={t.id}
                      style={{
                        left: left(t.start_minutes),
                        width: width(t.start_minutes, t.end_minutes),
                      }}
                      onClick={() => setSelected(t)}
                    >
                      <span className="kb-title">{t.title}</span>
                      <span className="kb-event">{t.event_name}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* ---------- away from the kitchen ---------- */}
          {windows.length > 0 && (
            <>
              <div className="resgrid-divider">
                <span>Away from the kitchen</span>
              </div>

              {[...new Set(windows.map((w) => w.request_id))].map((rid) => {
                const mine = windows.filter((w) => w.request_id === rid);
                const first = mine[0];
                return (
                  <div className="resgrid-row" key={rid}>
                    <div className="resgrid-label">
                      <Link
                        href={`/staff/${rid}`}
                        className="resgrid-name room-link"
                      >
                        {first.event_name}
                      </Link>
                      <span className="resgrid-sub">
                        {first.space_name ?? 'Off campus'}
                        {first.attendance ? ` \u00b7 ${first.attendance}` : ''}
                      </span>
                    </div>
                    <div
                      className="resgrid-track"
                      style={{ width: hours.length * HOUR_WIDTH }}
                    >
                      {mine.map((w) => (
                        <Link
                          href={`/staff/${w.request_id}`}
                          className={`service-block ${w.kind}${
                            w.room_conflict ? ' conflict' : ''
                          }`}
                          key={w.id}
                          style={{
                            left: left(w.start_minutes),
                            width: width(w.start_minutes, w.end_minutes),
                          }}
                          title={`${KIND_LABEL[w.kind]} \u00b7 ${w.staff_count} staff`}
                        >
                          <span className="kb-title">
                            {KIND_LABEL[w.kind] ?? w.kind}
                          </span>
                          <span className="kb-event">
                            {w.staff_count} staff
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ---------- the task panel ---------- */}
      {selected && (
        <div className="booking-panel">
          <div className="booking-head">
            <div>
              <span className="eyebrow">
                {selected.station_name ?? 'No station'}
              </span>
              <h3>{selected.title}</h3>
              <p className="sub">
                {label(selected.start_minutes)} {'\u2013'}{' '}
                {label(selected.end_minutes)}
                {selected.quantity
                  ? ` \u00b7 ${Number(selected.quantity)} ${selected.unit ?? ''}`
                  : ''}
              </p>
            </div>
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          {selected.event_name && (
            <div className="task-event">
              <div>
                <span className="task-event-name">{selected.event_name}</span>
                <span className="task-event-meta">
                  {selected.customer_name}
                  {selected.space_name ? ` \u00b7 ${selected.space_name}` : ''}
                  {selected.reference_code
                    ? ` \u00b7 ${selected.reference_code}`
                    : ''}
                </span>
              </div>
              <Link
                href={`/staff/${selected.request_id}`}
                className="btn btn-ghost"
              >
                Open the event
              </Link>
            </div>
          )}

          {selected.no_recipe && (
            <div className="callout c-warn">
              <strong>No recipe for this one</strong>
              The times are a guess. Writing the recipe would make the next
              one right.
            </div>
          )}

          {selected.note && <p className="sec-note">{selected.note}</p>}

          <div className="actions">
            {selected.state === 'planned' && (
              <button
                className="btn btn-primary"
                disabled={busy === selected.id}
                onClick={() =>
                  act(
                    {
                      action: 'state',
                      taskId: selected.id,
                      state: 'in_progress',
                    },
                    selected.id
                  )
                }
              >
                Start it
              </button>
            )}
            {selected.state !== 'done' && (
              <button
                className="btn btn-primary"
                disabled={busy === selected.id}
                onClick={() =>
                  act(
                    { action: 'state', taskId: selected.id, state: 'done' },
                    selected.id
                  )
                }
              >
                Done
              </button>
            )}
            {selected.state === 'done' && (
              <button
                className="btn btn-ghost"
                disabled={busy === selected.id}
                onClick={() =>
                  act(
                    { action: 'state', taskId: selected.id, state: 'planned' },
                    selected.id
                  )
                }
              >
                Not done after all
              </button>
            )}
            <button
              className="btn btn-ghost danger"
              disabled={busy === selected.id}
              onClick={() =>
                act({ action: 'remove', taskId: selected.id }, selected.id)
              }
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* ---------- events with no plan ---------- */}
      {unplanned.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2 className="bo-heading">Events with no plan yet</h2>
          <p className="sub">
            Planning reads the menu and works backwards from service. Where a
            recipe exists the times come from it; where one does not, a task is
            still made and marked as a guess.
          </p>
          <div className="unplanned-list">
            {unplanned.map((e) => (
              <div className="unplanned-row" key={e.id}>
                <div>
                  <Link href={`/staff/${e.id}`} className="unplanned-name">
                    {e.event_name}
                  </Link>
                  <span className="unplanned-meta">
                    {e.event_date}
                    {e.start_time ? ` \u00b7 ${e.start_time}` : ''}
                    {' \u00b7 '}
                    {e.attendance} guests {'\u00b7'} {e.menu_lines} menu line
                    {e.menu_lines === 1 ? '' : 's'}
                    {e.space_name ? ` \u00b7 ${e.space_name}` : ''}
                  </span>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={busy === e.id}
                  onClick={() =>
                    act(
                      {
                        action: 'plan',
                        requestId: e.id,
                        includeService: true,
                      },
                      e.id
                    )
                  }
                >
                  {busy === e.id ? 'Planning...' : 'Plan it'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
