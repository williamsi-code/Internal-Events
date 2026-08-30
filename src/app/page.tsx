import Link from 'next/link';
import { getSiteSettings, getSiteBlocks } from '@/lib/site';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const money = (v: string | null) =>
  v === null
    ? null
    : Number(v).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      });

export default async function Home() {
  const [settings, news, menuSpots, staffSpots, gallery, user] =
    await Promise.all([
      getSiteSettings(),
      getSiteBlocks('news'),
      getSiteBlocks('menu_spotlight'),
      getSiteBlocks('staff_spotlight'),
      getSiteBlocks('gallery'),
      getSessionUser(),
    ]);

  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');

  return (
    <div className="landing">
      {/* ---------- slim utility bar ---------- */}
      <div className="util">
        <div className="util-inner">
          <span className="util-contact">
            {settings?.contact_phone}
            {settings?.contact_email && (
              <>
                {' \u00b7 '}
                <a href={`mailto:${settings.contact_email}`}>
                  {settings.contact_email}
                </a>
              </>
            )}
          </span>
          <span className="util-links">
            {user ? (
              <>
                {isStaff && <Link href="/staff">Staff queue</Link>}
                <Link href="/my-requests">My requests</Link>
              </>
            ) : (
              <Link href="/sign-in">Sign in</Link>
            )}
          </span>
        </div>
      </div>

      {/* ---------- hero ---------- */}
      <header
        className="hero"
        style={
          settings?.hero_image_url
            ? { backgroundImage: `url(${settings.hero_image_url})` }
            : undefined
        }
      >
        <div className="hero-inner">
          <span className="hero-eyebrow">{settings?.hero_eyebrow}</span>
          <h1>{settings?.hero_title}</h1>
          {settings?.hero_subtitle && (
            <p className="hero-sub">{settings.hero_subtitle}</p>
          )}
        </div>
      </header>

      {/* ---------- three gateways ---------- */}
      <section className="gateways">
        <div className="gateways-inner">
          {settings?.intro_heading && (
            <div className="section-head">
              <h2>{settings.intro_heading}</h2>
              {settings.intro_body && <p>{settings.intro_body}</p>}
            </div>
          )}

          <div className="gateway-grid">
            <Link href="/start" className="gateway internal">
              <span className="gateway-tag">Central departments</span>
              <h3>Book a College event</h3>
              <p>
                Departments, student organizations and College programming.
                We&rsquo;ll confirm how your event is classified, then handle
                menu, setup and billing to your account.
              </p>
              <span className="gateway-go">Start a request &rarr;</span>
            </Link>

            <Link href="/order" className="gateway external">
              <span className="gateway-tag">Everyone else</span>
              <h3>Order catering</h3>
              <p>
                Weddings, receptions, business meetings and community events,
                on campus or delivered. Tell us what you need and we&rsquo;ll
                come back with a quote and a date hold.
              </p>
              <span className="gateway-go">Start an order &rarr;</span>
            </Link>

            <Link href="/enquiry" className="gateway enquiry">
              <span className="gateway-tag">Not sure yet</span>
              <h3>Ask us something</h3>
              <p>
                Working out what&rsquo;s possible, what a room holds, or what it
                might cost? Send us a note and someone will get back to you.
              </p>
              <span className="gateway-go">Send an enquiry &rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- menu spotlights ---------- */}
      {menuSpots.length > 0 && (
        <section className="spotlight-band">
          <div className="band-inner">
            <div className="section-head light">
              <h2>On the menu</h2>
              <p>
                A few things we are proud of. The full menu runs to well over a
                hundred items.
              </p>
            </div>
            <div className="spotlight-grid">
              {menuSpots.map((s) => (
                <article className="spotlight" key={s.id}>
                  {s.image_url ? (
                    <div
                      className="spotlight-img"
                      style={{ backgroundImage: `url(${s.image_url})` }}
                      role="img"
                      aria-label={s.image_alt ?? s.title}
                    />
                  ) : (
                    <div className="spotlight-img placeholder" aria-hidden="true" />
                  )}
                  <div className="spotlight-body">
                    {s.subtitle && (
                      <span className="spotlight-cat">{s.subtitle}</span>
                    )}
                    <h3>{s.title}</h3>
                    {s.body && <p>{s.body}</p>}
                    {s.menu_price && (
                      <span className="spotlight-price">
                        {money(s.menu_price)}{' '}
                        <span className="unit">{s.menu_unit}</span>
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="band-cta">
              <Link href="/info/catering-menu" className="btn btn-light">
                See the full menu
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---------- news ---------- */}
      {news.length > 0 && (
        <section className="news">
          <div className="news-inner">
            <div className="section-head">
              <h2>Latest from the kitchen</h2>
            </div>
            <div className="news-grid">
              {news.map((n) => (
                <article className="news-card" key={n.id}>
                  {n.image_url && (
                    <div
                      className="news-img"
                      style={{ backgroundImage: `url(${n.image_url})` }}
                      role="img"
                      aria-label={n.image_alt ?? n.title}
                    />
                  )}
                  <div className="news-body">
                    {n.subtitle && <span className="news-tag">{n.subtitle}</span>}
                    <h3>{n.title}</h3>
                    {n.body && <p>{n.body}</p>}
                    {n.link_url && (
                      <a href={n.link_url} className="news-link">
                        {n.link_label ?? 'Read more'} &rarr;
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- staff spotlight ---------- */}
      {staffSpots.length > 0 && (
        <section className="staff-band">
          <div className="band-inner">
            <div className="section-head">
              <h2>The people cooking</h2>
            </div>
            <div className="staff-grid">
              {staffSpots.map((s) => (
                <article className="staff-card" key={s.id}>
                  {s.image_url ? (
                    <div
                      className="staff-img"
                      style={{ backgroundImage: `url(${s.image_url})` }}
                      role="img"
                      aria-label={s.image_alt ?? s.title}
                    />
                  ) : (
                    <div className="staff-img placeholder" aria-hidden="true" />
                  )}
                  <h3>{s.title}</h3>
                  {s.subtitle && <span className="staff-role">{s.subtitle}</span>}
                  {s.body && <p>{s.body}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- gallery ---------- */}
      {gallery.length > 0 && (
        <section className="gallery">
          {gallery.map((g) => (
            <div
              className="gallery-tile"
              key={g.id}
              style={
                g.image_url
                  ? { backgroundImage: `url(${g.image_url})` }
                  : undefined
              }
              role="img"
              aria-label={g.image_alt ?? g.title}
            >
              <span>{g.title}</span>
            </div>
          ))}
        </section>
      )}

      {/* ---------- spaces teaser ---------- */}
      <section className="spaces-teaser">
        <div className="teaser-inner">
          <div>
            <h2>Somewhere to hold it</h2>
            <p>
              Dining rooms, a ballroom, an atrium and outdoor space, with
              capacities from a dozen to several hundred. Catering is available
              in most of them.
            </p>
            <Link href="/info/event-spaces" className="btn btn-primary">
              Browse event spaces
            </Link>
          </div>
          <div className="teaser-links">
            <Link href="/info/classification">
              <strong>How events are classified</strong>
              <span>Internal, affiliated and external, and what each means</span>
            </Link>
            <Link href="/info/internal-policies">
              <strong>Catering policies</strong>
              <span>Deposits, guest counts, cancellation and delivery</span>
            </Link>
            <Link href="/caterers">
              <strong>Outside caterers</strong>
              <span>Bringing food onto campus, and applying to cater</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="landing-foot">
        <div className="foot-inner">
          <div>
            <div className="wordmark light">
              Central <span>College</span>
            </div>
            <p className="foot-unit">Events &amp; Conferences</p>
          </div>
          <div className="foot-contact">
            {settings?.contact_phone && <p>{settings.contact_phone}</p>}
            {settings?.contact_email && (
              <p>
                <a href={`mailto:${settings.contact_email}`}>
                  {settings.contact_email}
                </a>
              </p>
            )}
            {settings?.office_hours && (
              <p className="foot-hours">{settings.office_hours}</p>
            )}
          </div>
          <nav className="foot-nav" aria-label="Footer">
            <Link href="/start">Book a College event</Link>
            <Link href="/order">Order catering</Link>
            <Link href="/enquiry">Ask a question</Link>
            <Link href="/info/catering-menu">Menu</Link>
            <Link href="/info/event-spaces">Spaces</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
