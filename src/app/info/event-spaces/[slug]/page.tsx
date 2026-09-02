import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import SpaceGallery from '@/components/SpaceGallery';
import PanZoomImage from '@/components/PanZoomImage';
import { getSessionUser } from '@/lib/auth';
import {
  getSpaceBySlug,
  getSpacePhotos,
  getRelatedSpaces,
  splitLines,
  parseSetup,
} from '@/lib/space-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);
  return {
    title: space
      ? `${space.name} - Central College`
      : 'Event space - Central College',
  };
}

const money = (v: string) =>
  Number(v) === 0
    ? null
    : Number(v).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });

export default async function SpacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);
  if (!space || !space.is_active) notFound();

  const user = await getSessionUser();
  const isCentral =
    !!user &&
    (user.email.toLowerCase().endsWith('@central.edu') ||
      user.roles.includes('events_staff') ||
      user.roles.includes('admin'));

  // Internal-only rooms are not a public page. Someone with the link
  // and no Central account gets the list instead.
  if (!space.externally_bookable && !isCentral) {
    redirect('/info/event-spaces');
  }

  const [photos, related] = await Promise.all([
    getSpacePhotos(space.id),
    getRelatedSpaces(space),
  ]);

  const features = splitLines(space.features);
  const setups = splitLines(space.setup_options).map(parseSetup);
  const goodFor = splitLines(space.good_for);
  const rate = money(space.facility_rate_external);

  return (
    <>
      <Masthead variant="public" current="/info/event-spaces" />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '64rem' }}>
          <Link href="/info/event-spaces" className="backlink-inline">
            &larr; All event spaces
          </Link>

          <div className="space-head">
            <div>
              {space.building && (
                <span className="space-building">{space.building}</span>
              )}
              <h1>{space.name}</h1>
              {space.tagline && <p className="space-tagline">{space.tagline}</p>}
            </div>
            {!space.externally_bookable && (
              <span className="pill p-review">Internal only</span>
            )}
          </div>

          <SpaceGallery
            photos={photos}
            heroUrl={space.hero_url}
            heroAlt={space.hero_alt}
            spaceName={space.name}
          />

          <div className="space-layout">
            <div className="space-main">
              {space.long_description && (
                <section className="info-section">
                  <p className="space-lede">{space.long_description}</p>
                </section>
              )}

              {setups.length > 0 && (
                <section className="info-section">
                  <h2 className="info-h2">How it can be set up</h2>
                  <table className="setup-table">
                    <tbody>
                      {setups.map((s, i) => (
                        <tr key={i}>
                          <td>{s.label}</td>
                          <td className="num">
                            {s.count ? `${s.count} guests` : '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="info-p muted">
                    Capacities vary with the setup and with anything else in the
                    room. If you are close to a limit, ask and we will check.
                  </p>
                </section>
              )}

              {features.length > 0 && (
                <section className="info-section">
                  <h2 className="info-h2">In the room</h2>
                  <ul className="feature-list">
                    {features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </section>
              )}

              {space.floorplan_url && (
                <section className="info-section">
                  <h2 className="info-h2">Floor plan</h2>
                  <PanZoomImage
                    src={space.floorplan_url}
                    alt={space.floorplan_alt ?? `Floor plan of ${space.name}`}
                    height="24rem"
                  />
                </section>
              )}

              {(space.accessibility_notes || space.nearby_parking) && (
                <section className="info-section">
                  <h2 className="info-h2">Getting there</h2>
                  {space.nearby_parking && (
                    <p className="info-p">
                      <strong>Parking.</strong> {space.nearby_parking}
                    </p>
                  )}
                  {space.accessibility_notes && (
                    <p className="info-p">
                      <strong>Accessibility.</strong>{' '}
                      {space.accessibility_notes}
                    </p>
                  )}
                </section>
              )}
            </div>

            <aside className="space-aside">
              <div className="space-facts">
                {space.capacity_seated && (
                  <div>
                    <span className="cap-l">Seated</span>
                    <span className="cap-n">{space.capacity_seated}</span>
                  </div>
                )}
                {space.capacity_standing && (
                  <div>
                    <span className="cap-l">Standing</span>
                    <span className="cap-n">{space.capacity_standing}</span>
                  </div>
                )}
                <div>
                  <span className="cap-l">Catering</span>
                  <span className="cap-n small">
                    {space.supports_catering ? 'Available' : 'Not usually'}
                  </span>
                </div>
                {rate && (
                  <div>
                    <span className="cap-l">Facility fee</span>
                    <span className="cap-n small">
                      {rate} {space.rate_basis}
                    </span>
                  </div>
                )}
              </div>

              {goodFor.length > 0 && (
                <div className="space-goodfor">
                  <h3>Good for</h3>
                  <ul>
                    {goodFor.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-cta">
                <Link href="/order" className="btn btn-primary">
                  Order catering here
                </Link>
                <Link href="/enquiry" className="btn btn-ghost">
                  Ask about this room
                </Link>
              </div>
            </aside>
          </div>

          {related.length > 0 && (
            <section className="info-section" style={{ marginTop: '2.5rem' }}>
              <h2 className="info-h2">You might also consider</h2>
              <div className="related-grid">
                {related.map((r) => (
                  <Link
                    href={`/info/event-spaces/${r.slug}`}
                    className="related-card"
                    key={r.id}
                  >
                    <div
                      className={`related-photo${r.hero_url ? '' : ' placeholder'}`}
                      style={
                        r.hero_url
                          ? { backgroundImage: `url(${r.hero_url})` }
                          : undefined
                      }
                    />
                    <div className="related-body">
                      <strong>{r.name}</strong>
                      <span>
                        {r.building}
                        {r.capacity_seated
                          ? ` \u00b7 seats ${r.capacity_seated}`
                          : ''}
                      </span>
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
