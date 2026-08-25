import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { getCateringSheet, getCateringLines } from '@/lib/catering';
import { classificationLabel, type Classification } from '@/lib/classify';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catering sheet' };

const money = (v: string | number) =>
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default async function CateringSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sheet = await getCateringSheet(id);
  if (!sheet) notFound();

  const lines = await getCateringLines(id);
  const total = lines.reduce((s, l) => s + Number(l.line_total), 0);

  // Allergen notes are collected per item, but the kitchen needs them in
  // one place rather than scattered down the order.
  const allergens = [
    ...new Set(
      lines
        .map((l) => l.allergen_notes)
        .filter((a): a is string => !!a && a !== 'Varies by selection')
    ),
  ];

  const headcount = sheet.final_attendance ?? sheet.estimated_attendance;
  const headcountIsFinal = sheet.final_attendance !== null;

  const grouped = lines.reduce<Record<string, typeof lines>>((acc, l) => {
    (acc[l.category] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="sheet-page">
      <div className="sheet-toolbar no-print">
        <Link href={`/staff/${id}`} className="backlink-inline">
          &larr; Back to request
        </Link>
        <span className="sheet-hint">
          Use your browser&rsquo;s print command to print or save as PDF.
        </span>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <div className="sheet-head-left">
            <div className="sheet-org">Central College &middot; Events &amp; Conferences</div>
            <h1>{sheet.event_name}</h1>
            <div className="sheet-ref">{sheet.reference_code}</div>
          </div>
          <div className="sheet-head-right">
            <div className="sheet-count">
              <span className="sheet-count-n">{headcount}</span>
              <span className="sheet-count-l">
                {headcountIsFinal ? 'final count' : 'estimated'}
              </span>
            </div>
          </div>
        </header>

        {!headcountIsFinal && (
          <div className="sheet-alert">
            Final headcount not yet received
            {sheet.headcount_due_on ? ` \u2014 due ${sheet.headcount_due_on}` : ''}.
            Quantities below are based on the estimate.
          </div>
        )}

        <section className="sheet-when">
          <div>
            <span className="sheet-label">Date</span>
            <span className="sheet-value strong">{sheet.event_date_long}</span>
          </div>
          <div>
            <span className="sheet-label">Event time</span>
            <span className="sheet-value strong">
              {sheet.start_time ?? '\u2014'}
              {sheet.end_time ? ` \u2013 ${sheet.end_time}` : ''}
            </span>
          </div>
          <div>
            <span className="sheet-label">Location</span>
            <span className="sheet-value strong">
              {sheet.space_building
                ? `${sheet.space_building} \u2014 ${sheet.space_name}`
                : sheet.space_name ?? sheet.location_freetext ?? '\u2014'}
            </span>
          </div>
          <div>
            <span className="sheet-label">Service style</span>
            <span className="sheet-value">
              {sheet.service_expectations ?? 'Not specified'}
            </span>
          </div>
        </section>

        {sheet.dietary_restrictions && (
          <section className="sheet-dietary">
            <h2>Dietary restrictions and allergies</h2>
            <p>{sheet.dietary_restrictions}</p>
          </section>
        )}

        <section className="sheet-section">
          <h2>Order</h2>
          {lines.length === 0 ? (
            <p className="sheet-empty">
              No menu items selected. Confirm with the events office before
              production.
            </p>
          ) : (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([category, items]) => (
                  <>
                    <tr className="sheet-cat" key={category}>
                      <th colSpan={4}>{category}</th>
                    </tr>
                    {items.map((l, i) => (
                      <tr key={`${category}-${i}`}>
                        <td>
                          <span className="sheet-item">{l.name}</span>
                          {l.description && (
                            <span className="sheet-item-desc">{l.description}</span>
                          )}
                          {l.notes && (
                            <span className="sheet-item-note">{l.notes}</span>
                          )}
                        </td>
                        <td className="num strong">{l.quantity}</td>
                        <td className="num">{money(l.unit_price_quoted)}</td>
                        <td className="num">{money(l.line_total)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="num strong">
                    Estimated total
                  </td>
                  <td className="num strong">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {allergens.length > 0 && (
            <p className="sheet-allergens">
              <strong>Allergens across this order:</strong> {allergens.join('; ')}
            </p>
          )}
        </section>

        <section className="sheet-cols">
          <div className="sheet-section">
            <h2>Setup</h2>
            <dl className="sheet-dl">
              {sheet.room_setup && (
                <>
                  <dt>Room</dt>
                  <dd>{sheet.room_setup}</dd>
                </>
              )}
              {sheet.equipment && (
                <>
                  <dt>Equipment</dt>
                  <dd>{sheet.equipment}</dd>
                </>
              )}
              {sheet.technology && (
                <>
                  <dt>Technology</dt>
                  <dd>{sheet.technology}</dd>
                </>
              )}
              {!sheet.room_setup && !sheet.equipment && !sheet.technology && (
                <dd className="sheet-empty">Nothing specified.</dd>
              )}
            </dl>
          </div>

          <div className="sheet-section">
            <h2>Contact</h2>
            <dl className="sheet-dl">
              <dt>Requester</dt>
              <dd>{sheet.requester_name}</dd>
              <dt>Department</dt>
              <dd>{sheet.department_org}</dd>
              {sheet.contact_phone && (
                <>
                  <dt>Phone</dt>
                  <dd className="strong">{sheet.contact_phone}</dd>
                </>
              )}
              <dt>Email</dt>
              <dd>{sheet.contact_email}</dd>
            </dl>
          </div>
        </section>

        {sheet.special_requests && (
          <section className="sheet-section">
            <h2>Special requests</h2>
            <p>{sheet.special_requests}</p>
          </section>
        )}

        <section className="sheet-section">
          <h2>Billing</h2>
          <dl className="sheet-dl inline">
            <dt>Classification</dt>
            <dd>
              {sheet.classification
                ? classificationLabel(sheet.classification as Classification)
                : 'Not classified'}
            </dd>
            {sheet.budget_account && (
              <>
                <dt>Account</dt>
                <dd className="mono">{sheet.budget_account}</dd>
              </>
            )}
            {sheet.outside_org_name && (
              <>
                <dt>Outside organization</dt>
                <dd>{sheet.outside_org_name}</dd>
              </>
            )}
          </dl>
        </section>

        <footer className="sheet-foot">
          <span>
            {sheet.confirmed_on
              ? `Confirmed ${sheet.confirmed_on}`
              : `Status: ${sheet.status.replace(/_/g, ' ')}`}
          </span>
          <span>Printed {sheet.printed_for}</span>
        </footer>
      </article>
    </div>
  );
}
