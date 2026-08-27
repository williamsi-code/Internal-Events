import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { listApprovedCaterers } from '@/lib/caterers';

export const metadata = { title: 'Catering at Central College' };
export const dynamic = 'force-dynamic';

export default async function CaterersPage() {
  const approved = await listApprovedCaterers();
  const usable = approved.filter(
    (c) => !c.insurance_lapsed && !c.license_lapsed
  );

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Catering at Central College</h1>
          <p className="lede">
            Most events on campus are catered by Central Dining. Where an
            outside caterer is used instead, they must be approved in advance
            and hold current licensing and insurance.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '54rem' }}>
          <div className="tiles">
            <Link href="/info/catering-menu" className="tile primary">
              <h3>Central Dining</h3>
              <p>
                Our menu, with pricing for internal, affiliated, and external
                events. This is the usual path for events on campus.
              </p>
            </Link>
            <Link href="/caterers/apply" className="tile">
              <h3>Apply to cater</h3>
              <p>
                For catering businesses seeking approval to serve food at
                Central College events.
              </p>
            </Link>
          </div>

          <section className="info-section" style={{ marginTop: '2.5rem' }}>
            <h2 className="info-h2">Using an outside caterer</h2>
            <p className="info-p">
              A Central department or recognized organization sponsors every
              outside caterer engagement and is accountable for the event. The
              caterer brings their own equipment, service ware and transport,
              and takes their waste with them.
            </p>
            <p className="info-p">
              Central kitchen facilities are not available to outside caterers
              unless separately agreed. Food safety, temperature control, and
              allergen labelling remain the caterer&rsquo;s responsibility,
              because Central does not inspect or supervise food prepared off
              campus.
            </p>
            <p className="info-p">
              <Link href="/info/outside-caterer-policy">
                Read the full outside caterer requirements
              </Link>
            </p>
          </section>

          <section className="info-section">
            <h2 className="info-h2">Donated food</h2>
            <p className="info-p">
              Donated food is treated the same way as an outside caterer,
              because the question is not who paid for it but who prepared it
              and under what conditions. The sponsoring department accepts
              responsibility for anything served.
            </p>
            <p className="info-p">
              <Link href="/info/donated-food-policy">
                Read the donated food requirements
              </Link>
            </p>
          </section>

          <section className="info-section">
            <h2 className="info-h2">Approved caterers</h2>
            {usable.length === 0 ? (
              <p className="info-p muted">
                No caterers are currently approved. Contact the events office if
                you need to arrange outside catering.
              </p>
            ) : (
              <>
                <p className="info-p muted">
                  These caterers hold current approval. The list changes as
                  licensing and insurance are renewed, so check here rather than
                  working from an older copy.
                </p>
                <div className="space-grid">
                  {usable.map((c) => (
                    <div className="space-card" key={c.id}>
                      <h3>{c.business_name}</h3>
                      {c.cuisine_notes && (
                        <p className="space-desc">{c.cuisine_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="info-cta">
            <p>Ready to request an event?</p>
            <Link
              href="/start"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Start creating your event
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
