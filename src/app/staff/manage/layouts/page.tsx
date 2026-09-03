import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import NewLayoutButton from '@/components/NewLayoutButton';
import { getSessionUser } from '@/lib/auth';
import { listLayoutableSpaces, listLayouts } from '@/lib/layouts';

export const metadata = { title: 'Room layouts - back office' };
export const dynamic = 'force-dynamic';

export default async function LayoutsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [spaces, layouts] = await Promise.all([
    listLayoutableSpaces(),
    listLayouts(),
  ]);

  const templates = layouts.filter((l) => l.is_template);
  const forEvents = layouts.filter((l) => !l.is_template);
  const needsMeasuring = spaces.filter((s) =>
    s.layout_notes?.startsWith('PLACEHOLDER')
  );

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '62rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Room layouts</h1>
            <p className="lede">
              To-scale floor plans. Draw a layout for a particular event, or
              keep a template you start from each time.
            </p>
          </div>

          {needsMeasuring.length > 0 && (
            <div className="callout c-flag">
              <strong>
                {needsMeasuring.length} room
                {needsMeasuring.length === 1 ? ' has' : 's have'} estimated
                dimensions
              </strong>
              The measurements were guessed from capacity so the editor would
              work. Measure them properly before anyone plans a wedding around
              a diagram: {needsMeasuring.map((s) => s.name).join(', ')}. Edit
              them in <Link href="/staff/manage/spaces">Event spaces</Link>.
            </div>
          )}

          {spaces.length === 0 ? (
            <div className="card">
              <h2>No rooms have dimensions yet</h2>
              <p className="hint">
                A layout is only useful if it is to scale, so a room needs its
                width and length before one can be drawn.
              </p>
            </div>
          ) : (
            <NewLayoutButton spaces={spaces} />
          )}

          {templates.length > 0 && (
            <section style={{ marginTop: '2rem' }}>
              <h2 className="bo-heading">Templates</h2>
              <div className="layout-list">
                {templates.map((l) => (
                  <Link
                    href={`/staff/manage/layouts/${l.id}`}
                    className="layout-row"
                    key={l.id}
                  >
                    <div>
                      <span className="layout-name">{l.name}</span>
                      <span className="layout-meta">
                        {l.building ? `${l.building} \u2014 ` : ''}
                        {l.space_name}
                        {' \u00b7 '}
                        {l.width_feet}
                        {'\u00d7'}
                        {l.length_feet} ft
                      </span>
                    </div>
                    <div className="layout-stats">
                      <span>
                        <strong>{l.seats}</strong> seats
                      </span>
                      <span>
                        <strong>{l.item_count}</strong> pieces
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {forEvents.length > 0 && (
            <section style={{ marginTop: '2rem' }}>
              <h2 className="bo-heading">Drawn for an event</h2>
              <div className="layout-list">
                {forEvents.map((l) => (
                  <Link
                    href={`/staff/manage/layouts/${l.id}`}
                    className="layout-row"
                    key={l.id}
                  >
                    <div>
                      <span className="layout-name">{l.name}</span>
                      <span className="layout-meta">
                        {l.space_name}
                        {' \u00b7 updated '}
                        {l.updated_at}
                      </span>
                    </div>
                    <div className="layout-stats">
                      <span>
                        <strong>{l.seats}</strong> seats
                      </span>
                      {l.shared_at ? (
                        <span className="pill p-classified">Shared</span>
                      ) : (
                        <span className="pill p-review">Draft</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
