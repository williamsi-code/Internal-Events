import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { listPublicSpaces } from '@/lib/info-spaces';

export const metadata = { title: 'Event spaces - Central College' };
export const dynamic = 'force-dynamic';

const CATEGORY_NOTE: Record<string, string> = {
  'Meeting Venues':
    'Purpose-built for events. Catering is available throughout, and most of these can be arranged to suit.',
  'Outside Spaces':
    'Lawns, patios and open areas. Weather dependent, so an indoor alternative is worth holding alongside.',
  Academic:
    'Classrooms, lecture halls and studios. Bookable outside teaching hours, and catering is possible in most.',
  Athletics: 'Spaces within the Kuyper Athletics Complex.',
  Housing:
    'Residence hall common areas. Catering is not usually arranged in these.',
};

export default async function SpacesPage() {
  const spaces = await listPublicSpaces();
  const categories = [...new Set(spaces.map((s) => s.category ?? 'Other'))];

  return (
    <>
      <Masthead variant="public" current="/info/event-spaces" />
      <main id="main">
        <div className="pagehead">
          <h1>Event spaces</h1>
          <p className="lede">
            Rooms and outdoor areas across campus, from a six-person meeting to
            a thousand on the Peace Mall. Capacities depend on how a room is set
            up, so treat them as a guide and ask if you are close to the limit.
          </p>
        </div>

        <div className="shell info-shell">
          <nav className="space-jump" aria-label="Jump to category">
            {categories.map((c) => (
              <a href={`#${c.replace(/\s+/g, '-').toLowerCase()}`} key={c}>
                {c}
              </a>
            ))}
          </nav>

          {categories.map((category) => {
            const inCategory = spaces.filter(
              (s) => (s.category ?? 'Other') === category
            );
            const buildings = [
              ...new Set(inCategory.map((s) => s.building ?? 'Other')),
            ];

            return (
              <section
                className="info-section"
                key={category}
                id={category.replace(/\s+/g, '-').toLowerCase()}
              >
                <h2 className="info-h2">{category}</h2>
                {CATEGORY_NOTE[category] && (
                  <p className="info-p muted">{CATEGORY_NOTE[category]}</p>
                )}

                {buildings.map((building) => {
                  const rooms = inCategory.filter(
                    (s) => (s.building ?? 'Other') === building
                  );
                  const showBuilding = building !== category;

                  return (
                    <div className="building-block" key={building}>
                      {showBuilding && <h3 className="info-h3">{building}</h3>}
                      <table className="room-table">
                        <thead>
                          <tr>
                            <th>Room</th>
                            <th className="num">Capacity</th>
                            <th>Catering</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rooms.map((r) => (
                            <tr key={r.id}>
                              <td>{r.name}</td>
                              <td className="num">
                                {r.capacity_seated
                                  ? r.capacity_seated.toLocaleString()
                                  : '\u2014'}
                              </td>
                              <td>
                                {r.supports_catering ? (
                                  'Available'
                                ) : (
                                  <span className="muted-cell">Not usually</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </section>
            );
          })}

          <div className="info-cta">
            <p>Found somewhere that might work?</p>
            <div
              style={{
                display: 'flex',
                gap: '.6rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/start"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Central College event
              </Link>
              <Link
                href="/order"
                className="btn btn-ghost"
                style={{ textDecoration: 'none' }}
              >
                Order catering
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
