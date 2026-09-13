import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { listPublicMenu } from '@/lib/info';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Catering menu - Central College' };
export const dynamic = 'force-dynamic';

const money = (v: string | null) =>
  v === null ? null : `$${Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 2)}`;

export default async function MenuPage() {
  const user = await getSessionUser();

  // Only someone who might pay an internal or affiliated rate sees
  // those columns. Showing an outside customer three prices, two of
  // which they cannot have, starts a conversation about why not.
  const seesAllTiers =
    !!user &&
    (user.email.toLowerCase().endsWith('@central.edu') ||
      user.roles.includes('events_staff') ||
      user.roles.includes('admin'));

  const items = await listPublicMenu();
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <>
      <Masthead variant="public" current="/info/catering-menu" />
      <main id="main">
        <div className="pagehead">
          <h1>Catering menu</h1>
          <p className="lede">
            {seesAllTiers
              ? 'Fall 2026. Which rate applies depends on how your event is classified \u2014 internal events pay 30 percent of the published rate, affiliated events 60 percent.'
              : 'Fall 2026. Prices are per person unless noted otherwise.'}
          </p>
        </div>

        <div className="shell menu-shell">
          <nav className="menu-jump" aria-label="Jump to a section">
            {categories.map((c) => (
              <a href={`#${c.replace(/\s+/g, '-').toLowerCase()}`} key={c}>
                {c}
              </a>
            ))}
          </nav>

          {categories.map((category) => {
            const inCategory = items.filter((i) => i.category === category);
            const note = inCategory[0]?.category_description;

            return (
              <section
                className="menu-section"
                key={category}
                id={category.replace(/\s+/g, '-').toLowerCase()}
              >
                <h2>{category}</h2>
                {note && <p className="menu-section-note">{note}</p>}

                <div className="menu-items">
                  {inCategory.map((item) => (
                    <article className="menu-entry" key={item.id}>
                      <div className="menu-entry-head">
                        <h3>{item.name}</h3>
                        <span className="menu-dots" aria-hidden="true" />
                        <span className="menu-price">
                          {seesAllTiers ? (
                            <>
                              <span className="tier">
                                <span className="tier-l">Int</span>
                                {money(item.internal_price) ?? '\u2014'}
                              </span>
                              <span className="tier">
                                <span className="tier-l">Aff</span>
                                {money(item.affiliated_price) ?? '\u2014'}
                              </span>
                              <span className="tier ext">
                                <span className="tier-l">Ext</span>
                                {money(item.external_price) ?? '\u2014'}
                              </span>
                            </>
                          ) : (
                            money(item.external_price) ?? 'On request'
                          )}
                        </span>
                      </div>

                      {item.description && (
                        <p className="menu-entry-desc">{item.description}</p>
                      )}

                      {/* Choices read as prose here. The dropdowns
                          belong at ordering time, not while browsing. */}
                      {item.choices.length > 0 && (
                        <ul className="menu-entry-choices">
                          {item.choices.map((c) => {
                            const [label, ...rest] = c.split(': ');
                            return (
                              <li key={c}>
                                <span className="choice-label">{label}</span>
                                {rest.join(': ')}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {(item.unit !== 'per person' ||
                        item.minimum_quantity ||
                        item.allergen_notes) && (
                        <p className="menu-entry-meta">
                          {item.unit !== 'per person' && item.unit}
                          {item.minimum_quantity && item.minimum_quantity > 1
                            ? `${item.unit !== 'per person' ? ' \u00b7 ' : ''}minimum ${item.minimum_quantity}`
                            : ''}
                          {item.allergen_notes
                            ? ` \u00b7 ${item.allergen_notes}`
                            : ''}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          <div className="callout c-default" style={{ marginTop: '2rem' }}>
            <strong>Dietary requirements</strong>
            We can accommodate most requirements with five business days&rsquo;
            notice, though additional charges may apply. Our kitchen is not
            allergen free. Prices are subject to change with seasonal
            availability and market prices, and children aged four to eight are
            half price.
          </div>

          <div className="info-cta">
            <p>Ready to order?</p>
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
