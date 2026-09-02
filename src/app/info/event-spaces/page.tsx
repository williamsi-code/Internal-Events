import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { listPublicSpaces, listAllSpaces } from '@/lib/info-spaces';
import { getSessionUser } from '@/lib/auth';
import { query } from '@/lib/db';

export const metadata = { title: 'Event spaces - Central College' };
export const dynamic = 'force-dynamic';

const CATEGORY_NOTE: Record<string, string> = {
  'Meeting Venues':
    'Purpose-built for events, with catering available throughout and rooms that can be arranged to suit.',
  'Outside Spaces':
    'Lawns, patios and open areas. Weather dependent, so an indoor alternative is worth holding alongside.',
  Academic:
    'Classrooms, lecture halls and studios, bookable outside teaching hours.',
  Athletics: 'Spaces within the Kuyper Athletics Complex.',
  Housing: 'Residence hall common areas.',
};

const money = (v: string) =>
  Number(v) === 0
    ? null
    : Number(v).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });

export default async function SpacesPage() {
  const user = await getSessionUser();

  const isCentral =
    !!user &&
    (user.email.toLowerCase().endsWith('@central.edu') ||
      user.roles.includes('events_staff') ||
      user.roles.includes('admin'));

  const spaces = isCentral ? await listAllSpaces() : await listPublicSpaces();

  // Which rooms have a page worth opening. A room with no description
  // and no photograph should not be a link to a blank page.
  const detailed = await query<{ id: string; slug: string }>(
    `SELECT id, slug FROM spaces
      WHERE is_active AND slug IS NOT NULL
        AND (hero_media_id IS NOT NULL OR long_description IS NOT NULL)`
  );
  const slugs = new Map(detailed.map((d) => [d.id, d.slug]));

  const categories = [...new Set(spaces.map((s) => s.category ?? 'Other'))];

  return (
    <>
      <Masthead variant="public" current="/info/event-spaces" />
      <main id="main">
        <div className="pagehead">
          <h1>Event spaces</h1>
          <p className="lede">
            {isCentral
              ? 'Every bookable space on campus. Capacities depend on how a room is set up, so treat them as a guide and ask if you are close to the limit.'
              : 'Where we host events. Click a room to see photographs, setup options and what is in it.'}
          </p>
        </div>

        <div className="shell info-shell">
          {isCentral && (
            <div className="callout c-default" style={{ marginBottom: '1.5rem' }}>
              <strong>You are seeing the full campus list</strong>
              Outside customers see only Maytag Student Center, Graham
              Conference Center and the Chapel.
            </div>
          )}

          {categories.length > 1 && (
            <nav className="space-jump" aria-label="Jump to category">
              {categories.map((c) => (
                <a href={`#${c.replace(/\s+/g, '-').toLowerCase()}`} key={c}>
                  {c}
                </a>
              ))}
            </nav>
          )}

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
                  const anyRate = rooms.some(
                    (r) => Number(r.facility_rate_external) > 0
                  );

                  return (
                    <div className="building-block" key={building}>
                      {showBuilding && <h3 className="info-h3">{building}</h3>}
                      <table className="room-table">
                        <thead>
                          <tr>
                            <th>Room</th>
                            <th className="num">Capacity</th>
                            <th>Catering</th>
                            {anyRate && !isCentral && (
                              <th className="num">From</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {rooms.map((r) => {
                            const slug = slugs.get(r.id);
                            return (
                              <tr key={r.id}>
                                <td>
                                  {slug ? (
                                    <Link
                                      href={`/info/event-spaces/${slug}`}
                                      className="room-link"
                                    >
                                      {r.name}
                                    </Link>
                                  ) : (
                                    r.name
                                  )}
                                  {isCentral && !r.externally_bookable && (
                                    <span className="internal-only">
                                      Internal only
                                    </span>
                                  )}
                                </td>
                                <td className="num">
                                  {r.capacity_seated
                                    ? r.capacity_seated.toLocaleString()
                                    : '\u2014'}
                                </td>
                                <td>
                                  {r.supports_catering ? (
                                    'Available'
                                  ) : (
                                    <span className="muted-cell">
                                      Not usually
                                    </span>
                                  )}
                                </td>
                                {anyRate && !isCentral && (
                                  <td className="num">
                                    {money(r.facility_rate_external) ?? (
                                      <span className="muted-cell">
                                        On request
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
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
                href="/order"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Order catering
              </Link>
              <Link
                href="/enquiry"
                className="btn btn-ghost"
                style={{ textDecoration: 'none' }}
              >
                Ask a question
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
