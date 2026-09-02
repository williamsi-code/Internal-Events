import Link from 'next/link';
import { getSiteSettings, getSiteBlocks, splitList } from '@/lib/site';
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
  const [
    settings,
    occasions,
    testimonials,
    gallery,
    menuSpots,
    news,
    staff,
    user,
  ] = await Promise.all([
    getSiteSettings(),
    getSiteBlocks('occasion'),
    getSiteBlocks('testimonial'),
    getSiteBlocks('gallery'),
    getSiteBlocks('menu_spotlight'),
    getSiteBlocks('news'),
    getSiteBlocks('staff_spotlight'),
    getSessionUser(),
  ]);

  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');

  const services = splitList(settings?.services_list ?? null);
  const amenities = splitList(settings?.amenities_list ?? null);
  const quote = testimonials[0];

  return (
    <div className="landing">
      {/* ---------- slim bar ---------- */}
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
            <Link href="/info/catering-menu">Menu</Link>
            <Link href="/info/event-spaces">Spaces</Link>
            <Link href="/start">Central departments</Link>
            {user ? (
              <>
                {isStaff && <Link href="/staff">Staff</Link>}
                <Link href="/my-requests">My requests</Link>
              </>
            ) : (
              <Link href="/sign-in">Sign in</Link>
            )}
          </span>
        </div>
      </div>

      {/* ---------- hero ---------- */}
      <header className="hero-split">
        <div className="hero-words">
          <span className="hero-eyebrow">{settings?.hero_eyebrow}</span>
          <h1>{settings?.hero_title}</h1>
          {settings?.hero_subtitle && <p>{settings.hero_subtitle}</p>}
          <div className="hero-actions">
            <Link href="/order" className="btn-solid">
              Start your event
            </Link>
            {settings?.secondary_cta_url && (
              <Link href={settings.secondary_cta_url} className="btn-outline">
                {settings.secondary_cta_label ?? 'See our spaces'}
              </Link>
            )}
          </div>
        </div>
        <div
          className={`hero-photo${settings?.hero_image_url ? '' : ' placeholder'}`}
          style={
            settings?.hero_image_url
              ? { backgroundImage: `url(${settings.hero_image_url})` }
              : undefined
          }
          role="img"
          aria-label="Central College Catering"
        />
      </header>

      {/* ---------- occasions ---------- */}
      {occasions.length > 0 && (
        <section className="occasions">
          {occasions.map((o) => (
            <article className="occasion" key={o.id}>
              <div
                className={`occasion-photo${o.image_url ? '' : ' placeholder'}`}
                style={
                  o.image_url
                    ? { backgroundImage: `url(${o.image_url})` }
                    : undefined
                }
                role="img"
                aria-label={o.image_alt ?? o.title}
              />
              <div className="occasion-body">
                {o.subtitle && (
                  <span className="occasion-tag">{o.subtitle}</span>
                )}
                <h2>{o.title}</h2>
                {o.body && <p>{o.body}</p>}
                {o.link_url && (
                  <Link href={o.link_url} className="occasion-link">
                    {o.link_label ?? 'Find out more'} &rarr;
                  </Link>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* ---------- what you get ---------- */}
      {(services.length > 0 || amenities.length > 0) && (
        <section className="included">
          <div className="included-inner">
            {services.length > 0 && (
              <div>
                <h3>{settings?.services_heading}</h3>
                <ul>
                  {services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {amenities.length > 0 && (
              <div>
                <h3>{settings?.amenities_heading}</h3>
                <ul>
                  {amenities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="included-aside">
              <p>
                Every event is different. Tell us what you have in mind and we
                will come back with what is possible and what it costs.
              </p>
              <Link href="/enquiry" className="btn-outline">
                Ask us a question
              </Link>
            </div>
          </div>
        </section>
      )}

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
                  <div
                    className={`spotlight-img${s.image_url ? '' : ' placeholder'}`}
                    style={
                      s.image_url
                        ? { backgroundImage: `url(${s.image_url})` }
                        : undefined
                    }
                    role="img"
                    aria-label={s.image_alt ?? s.title}
                  />
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
              <Link href="/info/catering-menu" className="btn-light">
                See the full menu
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---------- gallery ---------- */}
      {gallery.length > 0 && (
        <section className="gallery-band">
          <div className="band-inner">
            <span className="band-label">Past events</span>
            <div className="gallery-strip">
              {gallery.map((g) => (
                <div
                  className={`gallery-tile${g.image_url ? '' : ' placeholder'}`}
                  key={g.id}
                  style={
                    g.image_url
                      ? { backgroundImage: `url(${g.image_url})` }
                      : undefined
                  }
                  role="img"
                  aria-label={g.image_alt ?? g.title}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- testimonial ---------- */}
      {quote && (
        <section className="quote-band">
          <blockquote>{quote.body}</blockquote>
          <cite>{quote.subtitle ?? quote.title}</cite>
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

      {/* ---------- staff ---------- */}
      {staff.length > 0 && (
        <section className="staff-band">
          <div className="band-inner">
            <div className="section-head">
              <h2>The people cooking</h2>
            </div>
            <div className="staff-grid">
              {staff.map((s) => (
                <article className="staff-card" key={s.id}>
                  <div
                    className={`staff-img${s.image_url ? '' : ' placeholder'}`}
                    style={
                      s.image_url
                        ? { backgroundImage: `url(${s.image_url})` }
                        : undefined
                    }
                    role="img"
                    aria-label={s.image_alt ?? s.title}
                  />
                  <h3>{s.title}</h3>
                  {s.subtitle && <span className="staff-role">{s.subtitle}</span>}
                  {s.body && <p>{s.body}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- closing ---------- */}
      <section className="closing">
        <div className="closing-inner">
          <h2>Ready when you are</h2>
          <p>
            Nothing is booked until we have talked it through and you have
            confirmed. Start wherever suits.
          </p>
          <div className="closing-actions">
            <Link href="/order" className="btn-solid">
              Order catering
            </Link>
            <Link href="/enquiry" className="btn-outline">
              Ask a question
            </Link>
            <Link href="/start" className="closing-internal">
              A Central department? Start here &rarr;
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
            {settings?.address && <p>{settings.address}</p>}
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
            <Link href="/order">Order catering</Link>
            <Link href="/start">Central College event</Link>
            <Link href="/enquiry">Ask a question</Link>
            <Link href="/info/catering-menu">Menu</Link>
            <Link href="/info/event-spaces">Spaces</Link>
            <Link href="/caterers">Outside caterers</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
