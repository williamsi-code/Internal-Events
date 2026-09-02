import { notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import {
  listPublicMenu,
  listPublicEventTypes,
  getContentPage,
} from '@/lib/info';
import { getSessionUser } from '@/lib/auth';
import { classificationLabel, type Classification } from '@/lib/classify';

export const dynamic = 'force-dynamic';

const SLUGS = [
  'catering-menu',
  'internal-policies',
  'external-policies',
  'classification',
  'outside-caterer-policy',
  'donated-food-policy',
] as const;

type Slug = (typeof SLUGS)[number];

const money = (v: string | null) =>
  v === null
    ? '\u2014'
    : Number(v).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      });

/** A deliberately small markdown subset: headings, bullets, paragraphs.
 *  Enough for policy text, with no dependency and no arbitrary HTML. */
function renderBody(body: string) {
  const blocks = body.split(/\n\s*\n/);
  return blocks.map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    if (lines[0].startsWith('## ')) {
      return (
        <h2 key={i} className="info-h2">
          {lines[0].slice(3)}
        </h2>
      );
    }
    if (lines.every((l) => l.startsWith('- '))) {
      return (
        <ul key={i} className="info-list">
          {lines.map((l, j) => (
            <li key={j}>{l.slice(2)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="info-p">
        {lines.join(' ')}
      </p>
    );
  });
}

export default async function InfoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as Slug)) notFound();

  const user = await getSessionUser();

  // Only someone who might actually pay an internal or affiliated rate
  // sees those columns. An outside customer seeing three prices, two of
  // which they cannot have, invites a conversation about why not.
  const seesAllTiers =
    !!user &&
    (user.email.toLowerCase().endsWith('@central.edu') ||
      user.roles.includes('events_staff') ||
      user.roles.includes('admin'));

  /* ---------- catering menu ---------- */
  if (slug === 'catering-menu') {
    const items = await listPublicMenu();
    const categories = [...new Set(items.map((i) => i.category))];

    return (
      <Shell
        slug={slug}
        title="Catering menu"
        lede={
          seesAllTiers
            ? 'What we can produce, and what it costs. Which rate applies depends on how your event is classified \u2014 internal events pay 30 percent of the published rate, affiliated events 60 percent, and external events the full rate.'
            : 'What we can produce, and what it costs. Prices are per person unless noted.'
        }
      >
        <div className="callout c-default" style={{ marginBottom: '1.5rem' }}>
          <strong>Minimums apply to some items</strong>
          We can often work around a minimum, so ask rather than assuming. Our
          kitchen is not allergen free, but we can accommodate most dietary
          requirements with five business days&rsquo; notice.
        </div>

        {categories.map((category) => {
          const catItems = items.filter((i) => i.category === category);
          return (
            <section key={category} className="info-section">
              <h2 className="info-h2">{category}</h2>
              {catItems[0]?.category_description && (
                <p className="info-p muted">{catItems[0].category_description}</p>
              )}
              <table className="menu-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    {seesAllTiers ? (
                      <>
                        <th className="num">Internal</th>
                        <th className="num">Affiliated</th>
                        <th className="num">External</th>
                      </>
                    ) : (
                      <th className="num">Price</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {catItems.map((i) => (
                    <tr key={i.name}>
                      <td>
                        <span className="menu-item-name">{i.name}</span>
                        {i.description && (
                          <span className="menu-item-desc">{i.description}</span>
                        )}
                        <span className="menu-item-meta">
                          {i.unit}
                          {i.minimum_quantity && i.minimum_quantity > 1
                            ? ` \u00b7 minimum ${i.minimum_quantity}`
                            : ''}
                          {i.allergen_notes ? ` \u00b7 ${i.allergen_notes}` : ''}
                        </span>
                      </td>
                      {seesAllTiers ? (
                        <>
                          <td className="num">{money(i.internal_price)}</td>
                          <td className="num">{money(i.affiliated_price)}</td>
                          <td className="num">{money(i.external_price)}</td>
                        </>
                      ) : (
                        <td className="num">{money(i.external_price)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        {seesAllTiers && (
          <div className="callout c-warn" style={{ marginTop: '1.5rem' }}>
            <strong>You are seeing all three rates</strong>
            Outside customers see only the external column. Which rate applies
            to a given event follows its classification, which the events office
            confirms.
          </div>
        )}
      </Shell>
    );
  }

  /* ---------- classification ---------- */
  if (slug === 'classification') {
    const types = await listPublicEventTypes();
    const categories = [...new Set(types.map((t) => t.category))];

    return (
      <Shell
        slug={slug}
        title="Classification of events"
        lede="Every event is classified as Internal, Affiliated, or External before pricing. The classification follows who owns the event, who benefits, and who pays \u2014 not who is asking."
      >
        <div className="class-defs">
          <div className="class-def internal">
            <h3>Internal</h3>
            <p>
              Central is the primary beneficiary. College programming,
              department business, and recognized student organization events.
            </p>
            <span className="class-rate">30% of the published rate</span>
          </div>
          <div className="class-def affiliated">
            <h3>Affiliated / sponsored</h3>
            <p>
              Central has a legitimate relationship, but an outside party also
              benefits substantially.
            </p>
            <span className="class-rate">60% of the published rate</span>
          </div>
          <div className="class-def external">
            <h3>External</h3>
            <p>
              An outside organization or private party is the primary
              beneficiary.
            </p>
            <span className="class-rate">The published rate</span>
          </div>
        </div>

        <div className="callout c-warn">
          <strong>Being part of Central does not make an event internal</strong>
          An employee&rsquo;s wedding and a faculty member&rsquo;s private
          retirement party are external events, because the College is not the
          beneficiary. What matters is whose event it is, not who is asking.
        </div>

        <h2 className="info-h2" style={{ marginTop: '2rem' }}>
          How common events are classified
        </h2>
        <p className="info-p muted">
          These are the standard classifications. Funding, revenue, and outside
          involvement can move an individual event, which is why the intake form
          asks about them.
        </p>

        {categories.map((category) => (
          <section key={category} className="info-section">
            <h3 className="info-h3">{category}</h3>
            <table className="class-table">
              <tbody>
                {types
                  .filter((t) => t.category === category)
                  .map((t) => (
                    <tr key={t.name}>
                      <td>
                        <span className="class-type">{t.name}</span>
                        {t.guidance && (
                          <span className="class-guidance">{t.guidance}</span>
                        )}
                      </td>
                      <td className="class-verdict">
                        {t.always_review || !t.default_classification ? (
                          <span className="pill p-review">
                            Reviewed individually
                          </span>
                        ) : (
                          <span className={`pill p-${t.default_classification}`}>
                            {classificationLabel(
                              t.default_classification as Classification
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </Shell>
    );
  }

  /* ---------- policy pages ---------- */
  const page = await getContentPage(slug);
  if (!page) notFound();

  return (
    <Shell slug={slug} title={page.title} lede={page.intro ?? undefined}>
      <div className="info-body">{renderBody(page.body)}</div>
      <p className="info-updated">Last updated {page.updated_at}</p>
    </Shell>
  );
}

function Shell({
  slug,
  title,
  lede,
  children,
}: {
  slug: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Masthead variant="public" current={`/info/${slug}`} />
      <main id="main">
        <div className="pagehead">
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
        </div>
        <div className="shell info-shell">
          {children}
          <div className="info-cta">
            <p>Ready to get started?</p>
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
