import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import KitchenGrid from '@/components/KitchenGrid';
import CateringCalendar from '@/components/CateringCalendar';
import { getSessionUser } from '@/lib/auth';
import {
  getCateredBookings,
  getCateredSpaces,
  getProductionDay,
  getServiceDay,
  listStations,
  getUnplanned,
  getDaySummary,
  getLoadRange,
} from '@/lib/production';

export const metadata = { title: 'Catering schedule' };
export const dynamic = 'force-dynamic';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sp = await searchParams;
  const day = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
    ? sp.date
    : iso(new Date());

  // Two questions, two calendars. "What are we catering Thursday"
  // wants rooms and times; "what is in which oven" wants stations.
  const view = sp.view === 'prep' ? 'prep' : 'events';

  const anchor = new Date(day + 'T12:00:00');
  const prev = new Date(anchor);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(anchor);
  next.setDate(next.getDate() + 1);

  const weekFrom = new Date(anchor);
  weekFrom.setDate(weekFrom.getDate() - 3);
  const weekTo = new Date(anchor);
  weekTo.setDate(weekTo.getDate() + 10);

  const [
    tasks, windows, stations, unplanned, summary, load,
    catered, cateredSpaces,
  ] = await Promise.all([
    getProductionDay(day),
    getServiceDay(day),
    listStations(),
    getUnplanned(),
    getDaySummary(day),
    getLoadRange(iso(weekFrom), iso(weekTo)),
    getCateredBookings(day, day),
    getCateredSpaces(day, day),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Catering schedule</h1>
          <p className="lede">
            {view === 'events'
              ? 'Everything with food in it, by room and time. The room schedule shows the rest of campus alongside it.'
              : 'What the kitchen has to make and when it has to be out, against the stations it happens at.'}
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '72rem' }}>
          <div className="sched-bar">
            <div className="sched-nav">
              <Link
                href={`/staff/kitchen?date=${iso(prev)}&view=${view}`}
                className="btn btn-ghost"
              >
                &larr;
              </Link>
              <span className="sched-when">
                {anchor.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <Link
                href={`/staff/kitchen?date=${iso(next)}&view=${view}`}
                className="btn btn-ghost"
              >
                &rarr;
              </Link>
              <Link
                href={`/staff/kitchen?date=${iso(new Date())}`}
                className="edit-link"
              >
                Today
              </Link>
            </div>
            <Link
              href={`/staff/schedule?date=${day}&view=day`}
              className="edit-link"
            >
              Room schedule
            </Link>
          </div>

          <div className="filters" role="group" aria-label="Which calendar">
            <Link
              href={`/staff/kitchen?date=${day}&view=events`}
              className="chip"
              aria-pressed={view === 'events'}
            >
              What we are catering
              {catered.length > 0 && (
                <span className="n">{catered.length}</span>
              )}
            </Link>
            <Link
              href={`/staff/kitchen?date=${day}&view=prep`}
              className="chip"
              aria-pressed={view === 'prep'}
            >
              Prep and duties
              {(summary?.tasks ?? 0) > 0 && (
                <span className="n">{summary?.tasks}</span>
              )}
            </Link>
          </div>

          {/* The fortnight either side, so a heavy Saturday is visible
              from the Tuesday before. */}
          <div className="load-strip">
            {load.map((l) => {
              const hours = Number(l.total_hours);
              const heavy = hours > 40;
              const busy = hours > 20;
              return (
                <Link
                  href={`/staff/kitchen?date=${l.day}&view=${view}`}
                  className={`load-day${l.day === day ? ' here' : ''}${
                    heavy ? ' heavy' : busy ? ' busy' : ''
                  }`}
                  key={l.day}
                >
                  <span className="load-date">
                    {new Date(l.day + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'narrow',
                    })}
                  </span>
                  <span className="load-n">
                    {new Date(l.day + 'T12:00:00').getDate()}
                  </span>
                  {hours > 0 && (
                    <span className="load-hours">{Math.round(hours)}h</span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="cap-facts">
            <div className="cap-fact">
              <span className="cap-n">{summary?.events ?? 0}</span>
              <span className="cap-l">events</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">
                {summary?.done ?? 0}/{summary?.tasks ?? 0}
              </span>
              <span className="cap-l">tasks done</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{summary?.task_hours ?? 0}h</span>
              <span className="cap-l">in the kitchen</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{summary?.service_hours ?? 0}h</span>
              <span className="cap-l">staff on service</span>
            </div>
            {(summary?.conflicts ?? 0) > 0 && (
              <div className="cap-fact bad">
                <span className="cap-n">{summary?.conflicts}</span>
                <span className="cap-l">clash with the room</span>
              </div>
            )}
          </div>

          {view === 'events' ? (
            <CateringCalendar
              bookings={catered}
              spaces={cateredSpaces}
              day={day}
            />
          ) : (
            <KitchenGrid
              day={day}
              tasks={tasks}
              windows={windows}
              stations={stations}
              unplanned={unplanned}
            />
          )}
        </div>
      </main>
    </>
  );
}
