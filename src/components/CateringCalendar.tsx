'use client';

import Link from 'next/link';
import type { CateredBooking } from '@/lib/production';

/**
 * What we are catering, by room and time.
 *
 * The same shape as the room scheduler so it needs no learning, but
 * only the events with food in them, and only the rooms that have
 * one. Forty empty rows is not a calendar.
 *
 * Every block opens its event, because that is always the next
 * thing anyone wants.
 */

const DAY_START = 6;
const DAY_END = 23;
const HOUR_WIDTH = 78;

const FOOD_LABEL: Record<string, string> = {
  central_dining: 'Central',
  outside_caterer: 'Caterer',
  donated: 'Donated',
};

export default function CateringCalendar({
  bookings,
  spaces,
  day,
}: {
  bookings: CateredBooking[];
  spaces: {
    id: string;
    name: string;
    building: string | null;
    events: number;
  }[];
  day: string;
}) {
  const hours = Array.from(
    { length: DAY_END - DAY_START },
    (_, i) => DAY_START + i
  );

  const left = (minutes: number) =>
    ((minutes - DAY_START * 60) / 60) * HOUR_WIDTH;
  const width = (from: number, to: number) =>
    Math.max(((to - from) / 60) * HOUR_WIDTH, 44);

  const label = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const suffix = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}${suffix}`;
  };

  if (spaces.length === 0) {
    return (
      <div className="card">
        <h2>Nothing catered that day</h2>
        <p className="hint">
          Rooms booked without food are on{' '}
          <Link href={`/staff/schedule?date=${day}&view=day`}>
            the room schedule
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="resgrid catering">
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

          {spaces.map((s) => {
            const mine = bookings.filter((b) => b.space_id === s.id);
            return (
              <div className="resgrid-row" key={s.id}>
                <div className="resgrid-label">
                  <span className="resgrid-name">{s.name}</span>
                  <span className="resgrid-sub">{s.building}</span>
                </div>
                <div
                  className="resgrid-track"
                  style={{ width: hours.length * HOUR_WIDTH }}
                >
                  {mine.map((b) => {
                    const kinds = (b.food_kinds ?? '').split(',');
                    return (
                      <Link
                        href={`/staff/${b.request_id}`}
                        className={`catering-block ${b.status}${
                          b.central_cooking ? ' ours' : ' theirs'
                        }`}
                        key={b.id}
                        style={{
                          left: left(b.start_minutes),
                          width: width(b.start_minutes, b.end_minutes),
                        }}
                        title={`${b.event_name} \u00b7 ${b.attendance ?? '?'} guests`}
                      >
                        <span className="cb-title">{b.event_name}</span>
                        <span className="cb-meta">
                          {b.attendance ? `${b.attendance} \u00b7 ` : ''}
                          {kinds
                            .map((k) => FOOD_LABEL[k] ?? k)
                            .filter(Boolean)
                            .join(' + ')}
                        </span>
                      </Link>
                    );
                  })}

                  {/* The room is held longer than the event runs. The
                      faint bar is the hold; the solid block is the
                      event itself. */}
                  {mine.map((b) => (
                    <span
                      className="catering-hold"
                      key={`${b.id}-hold`}
                      style={{
                        left: left(b.hold_start_minutes),
                        width: width(
                          b.hold_start_minutes,
                          b.hold_end_minutes
                        ),
                      }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cal-legend">
        <span className="legend-item">
          <span className="swatch ours" /> We are cooking
        </span>
        <span className="legend-item">
          <span className="swatch theirs" /> Someone else is
        </span>
        <span className="legend-item">
          <span className="swatch hold" /> Room held for setup and clearing
        </span>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 className="bo-heading">That day in full</h2>
        <div className="catering-list">
          {bookings.map((b) => (
            <Link
              href={`/staff/${b.request_id}`}
              className="catering-row"
              key={b.id}
            >
              <div>
                <span className="catering-name">{b.event_name}</span>
                <span className="catering-meta">
                  {b.customer_name}
                  {' \u00b7 '}
                  {b.space_name}
                  {b.attendance ? ` \u00b7 ${b.attendance} guests` : ''}
                  {b.menu_lines > 0
                    ? ` \u00b7 ${b.menu_lines} menu line${
                        b.menu_lines === 1 ? '' : 's'
                      }`
                    : ' \u00b7 no menu yet'}
                </span>
              </div>
              <span className="catering-prep">
                {b.tasks === 0 ? (
                  <span className="pill p-review">Not planned</span>
                ) : (
                  <span className="pill p-type">
                    {b.tasks_done}/{b.tasks} prep done
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
