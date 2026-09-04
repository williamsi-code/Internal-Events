'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  ActivityRow,
  FinancialRow,
  LostRow,
  Completeness,
  ExceptionSummary,
  CapacitySummary,
  TopSpace,
  Period,
} from '@/lib/reports';

const money = (v: string | number) =>
  Number(v).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const CLASS_LABEL: Record<string, string> = {
  internal: 'Internal',
  affiliated: 'Affiliated',
  external: 'External',
  needs_management_review: 'Unresolved',
  unclassified: 'Unclassified',
};

export default function QuarterlyReport({
  from,
  to,
  periods,
  activity,
  financials,
  lost,
  completeness,
  exceptions,
  capacity,
  topSpaces,
}: {
  from: string;
  to: string;
  periods: Period[];
  activity: ActivityRow[];
  financials: FinancialRow[];
  lost: LostRow[];
  completeness: Completeness | null;
  exceptions: ExceptionSummary | null;
  capacity: CapacitySummary | null;
  topSpaces: TopSpace[];
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const totalEvents = activity.reduce((s, a) => s + Number(a.events), 0);
  const totalGuests = activity.reduce((s, a) => s + Number(a.attendance), 0);

  const row = (cls: string) => financials.find((x) => x.classification === cls);
  const capture = Number(completeness?.cost_capture_pct ?? 0);

  // The headline: what the College gave away by not charging outside
  // rates to its own people and partners.
  const totalDiscount = financials
    .filter((r) => r.classification !== 'external')
    .reduce((s, r) => s + Number(r.discount), 0);

  const external = row('external');
  const externalMargin = external
    ? Number(external.charged) - Number(external.true_cost)
    : 0;

  function apply() {
    router.push(`/staff/manage/reports/quarterly?from=${f}&to=${t}`);
  }

  return (
    <>
      <div className="report-controls no-print">
        <div className="field">
          <label htmlFor="rp-period">Period</label>
          <select
            id="rp-period"
            onChange={(e) => {
              const p = periods.find((x) => x.id === e.target.value);
              if (p) {
                setF(p.starts_on);
                setT(p.ends_on);
                router.push(
                  `/staff/manage/reports/quarterly?from=${p.starts_on}&to=${p.ends_on}`
                );
              }
            }}
            defaultValue=""
          >
            <option value="">Choose a period</option>
            {periods.map((p) => (
              <option value={p.id} key={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rp-from">From</label>
          <input
            id="rp-from"
            type="date"
            value={f}
            onChange={(e) => setF(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rp-to">To</label>
          <input
            id="rp-to"
            type="date"
            value={t}
            onChange={(e) => setT(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={apply}>
          Run
        </button>
        <span className="sheet-hint">
          Use your browser&rsquo;s print command to save as PDF.
        </span>
      </div>

      <article className="sheet report">
        <header className="sheet-head">
          <div className="sheet-head-left">
            <div className="sheet-org">
              Central College &middot; Events &amp; Conferences
            </div>
            <h1>Quarterly leadership report</h1>
            <div className="sheet-ref">
              {new Date(from + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              {' \u2013 '}
              {new Date(to + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
          <div className="sheet-head-right">
            <div className="sheet-count">
              <span className="sheet-count-n">{totalEvents}</span>
              <span className="sheet-count-l">events</span>
            </div>
          </div>
        </header>

        {/* ---------- headline ---------- */}
        <section className="sheet-section">
          <h2>The short version</h2>
          <div className="headline-figures">
            <div>
              <span className="cap-l">Events delivered</span>
              <span className="cap-n">{totalEvents}</span>
            </div>
            <div>
              <span className="cap-l">Guests served</span>
              <span className="cap-n">{totalGuests.toLocaleString()}</span>
            </div>
            <div className="wide">
              <span className="cap-l">
                Value provided to the College below external rates
              </span>
              <span className="cap-n">{money(totalDiscount)}</span>
            </div>
            <div className={externalMargin >= 0 ? 'pos' : 'neg'}>
              <span className="cap-l">External contribution</span>
              <span className="cap-n">{money(externalMargin)}</span>
            </div>
          </div>
          <p className="sheet-empty">
            The middle figure is what internal and affiliated events would have
            cost at published external rates, less what was actually charged. It
            is the clearest single measure of what Events and Conferences
            returns to the College, and it does not depend on close-out.
          </p>
        </section>

        {capture < 80 && (
          <div className="sheet-alert">
            Cost capture is {capture}% for this period, so the cost and margin
            figures below rest on partial data and should be read as a floor.
            The charged and external-rate comparisons are unaffected, because
            they come from prices rather than actuals.
          </div>
        )}

        {/* ---------- B ---------- */}
        <section className="sheet-section">
          <h2>Event activity</h2>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th className="num">Events</th>
                <th className="num">Attendance</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.classification}>
                  <td>{CLASS_LABEL[a.classification] ?? a.classification}</td>
                  <td className="num">{a.events}</td>
                  <td className="num">
                    {Number(a.attendance).toLocaleString()}
                  </td>
                  <td className="num">
                    {totalEvents
                      ? Math.round((Number(a.events) / totalEvents) * 100)
                      : 0}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">Total</td>
                <td className="num strong">{totalEvents}</td>
                <td className="num strong">{totalGuests.toLocaleString()}</td>
                <td className="num"></td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ---------- what each tier was charged against external ---------- */}
        <section className="sheet-section">
          <h2>Charged against external rates</h2>
          <p className="sheet-empty">
            What each group paid, what the same orders would have cost an
            outside customer, and the difference.
          </p>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th className="num">Events</th>
                <th className="num">Charged</th>
                <th className="num">At external rates</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {financials.map((r) => (
                <tr key={r.classification}>
                  <td>{CLASS_LABEL[r.classification] ?? r.classification}</td>
                  <td className="num">{r.events}</td>
                  <td className="num">{money(r.charged)}</td>
                  <td className="num">{money(r.external_value)}</td>
                  <td className="num strong">
                    {Number(r.discount) === 0 ? '\u2014' : money(r.discount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">Total</td>
                <td className="num strong">{totalEvents}</td>
                <td className="num strong">
                  {money(
                    financials.reduce((s, r) => s + Number(r.charged), 0)
                  )}
                </td>
                <td className="num strong">
                  {money(
                    financials.reduce((s, r) => s + Number(r.external_value), 0)
                  )}
                </td>
                <td className="num strong">{money(totalDiscount)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="sheet-empty">
            External events show no difference by definition: they are charged
            the published rate.
          </p>
        </section>

        {/* ---------- C, D, E ---------- */}
        {(['internal', 'affiliated', 'external'] as const).map((cls) => {
          const r = row(cls);
          if (!r) return null;
          const gap = Number(r.gap);
          const discount = Number(r.discount);
          return (
            <section className="sheet-section" key={cls}>
              <h2>
                {cls === 'internal'
                  ? 'Internal institutional support'
                  : cls === 'affiliated'
                    ? 'Affiliated partnership support'
                    : 'External business performance'}
              </h2>
              <div className="report-figures">
                <div>
                  <span className="cap-l">Events</span>
                  <span className="cap-n">{r.events}</span>
                </div>
                <div>
                  <span className="cap-l">Charged</span>
                  <span className="cap-n">{money(r.charged)}</span>
                </div>
                {cls === 'external' ? (
                  <>
                    <div>
                      <span className="cap-l">True cost</span>
                      <span className="cap-n">{money(r.true_cost)}</span>
                    </div>
                    <div className={gap >= 0 ? 'pos' : 'neg'}>
                      <span className="cap-l">Contribution</span>
                      <span className="cap-n">{money(gap)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="cap-l">At external rates</span>
                      <span className="cap-n">{money(r.external_value)}</span>
                    </div>
                    <div>
                      <span className="cap-l">
                        {cls === 'internal'
                          ? 'Institutional support'
                          : 'Partnership support'}
                      </span>
                      <span className="cap-n">{money(discount)}</span>
                    </div>
                  </>
                )}
              </div>

              <table className="sheet-table">
                <tbody>
                  <tr>
                    <td>Food</td>
                    <td className="num">{money(r.food_cost)}</td>
                    <td>Consumables</td>
                    <td className="num">{money(r.consumables_cost)}</td>
                  </tr>
                  <tr>
                    <td>Labor</td>
                    <td className="num">{money(r.labor_cost)}</td>
                    <td>Other direct</td>
                    <td className="num">{money(r.other_cost)}</td>
                  </tr>
                  <tr>
                    <td>Labor hours</td>
                    <td className="num">{Number(r.labor_hours).toFixed(1)}</td>
                    <td>Closed out</td>
                    <td className="num">
                      {r.closed_events} of {r.events}
                    </td>
                  </tr>
                  {cls !== 'external' && Number(r.external_value) > 0 && (
                    <tr>
                      <td>Effective discount</td>
                      <td className="num">
                        {Math.round(
                          (discount / Number(r.external_value)) * 100
                        )}
                        %
                      </td>
                      <td>Average per event</td>
                      <td className="num">
                        {Number(r.events) > 0
                          ? money(discount / Number(r.events))
                          : '\u2014'}
                      </td>
                    </tr>
                  )}
                  {cls === 'external' && (
                    <tr>
                      <td>Contribution margin</td>
                      <td className="num">
                        {Number(r.charged) > 0
                          ? `${Math.round((gap / Number(r.charged)) * 100)}%`
                          : '\u2014'}
                      </td>
                      <td>Average per event</td>
                      <td className="num">
                        {Number(r.events) > 0
                          ? money(Number(r.charged) / Number(r.events))
                          : '\u2014'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          );
        })}

        {/* ---------- F ---------- */}
        <section className="sheet-section">
          <h2>Staffing and capacity</h2>
          <div className="report-figures">
            <div>
              <span className="cap-l">Variable event hours</span>
              <span className="cap-n">
                {Number(capacity?.variable_hours ?? 0).toFixed(0)}
              </span>
            </div>
            <div>
              <span className="cap-l">Core staff hours</span>
              <span className="cap-n">
                {Number(capacity?.core_hours ?? 0).toFixed(0)}
              </span>
            </div>
            <div>
              <span className="cap-l">Events modified</span>
              <span className="cap-n">{capacity?.modified ?? 0}</span>
            </div>
            <div className={Number(capacity?.declined_capacity ?? 0) > 0 ? 'neg' : ''}>
              <span className="cap-l">Declined for capacity</span>
              <span className="cap-n">{capacity?.declined_capacity ?? 0}</span>
            </div>
          </div>
          <p className="sheet-empty">
            Events modified are those that went ahead in altered form. They show
            strain before it becomes lost revenue.
          </p>
        </section>

        {/* ---------- G ---------- */}
        {topSpaces.length > 0 && (
          <section className="sheet-section">
            <h2>Facility use</h2>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Space</th>
                  <th className="num">Events</th>
                  <th className="num">Guests</th>
                </tr>
              </thead>
              <tbody>
                {topSpaces.map((s) => (
                  <tr key={s.space_name}>
                    <td>
                      {s.building ? `${s.building} \u2014 ` : ''}
                      {s.space_name}
                    </td>
                    <td className="num">{s.events}</td>
                    <td className="num">{Number(s.guests).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ---------- H ---------- */}
        <section className="sheet-section">
          <h2>Lost and declined business</h2>
          {lost.length === 0 ? (
            <p className="sheet-empty">
              Nothing was declined in this period. That is either good news or a
              sign that declines are not being recorded.
            </p>
          ) : (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th className="num">Events</th>
                  <th className="num">Revenue lost</th>
                  <th className="num">Referred out</th>
                </tr>
              </thead>
              <tbody>
                {lost.map((l) => (
                  <tr key={l.reason}>
                    <td>{l.reason.replace(/_/g, ' ')}</td>
                    <td className="num">{l.occurrences}</td>
                    <td className="num">{money(l.revenue_lost)}</td>
                    <td className="num">{l.referred_out || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="strong">Total</td>
                  <td className="num strong">
                    {lost.reduce((s, l) => s + Number(l.occurrences), 0)}
                  </td>
                  <td className="num strong">
                    {money(lost.reduce((s, l) => s + Number(l.revenue_lost), 0))}
                  </td>
                  <td className="num"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {/* ---------- I ---------- */}
        <section className="sheet-section">
          <h2>Exceptions and risk</h2>
          <div className="report-figures">
            <div>
              <span className="cap-l">Exceptions approved</span>
              <span className="cap-n">{exceptions?.approved ?? 0}</span>
            </div>
            <div>
              <span className="cap-l">Denied</span>
              <span className="cap-n">{exceptions?.denied ?? 0}</span>
            </div>
            <div>
              <span className="cap-l">Estimated subsidy</span>
              <span className="cap-n">
                {money(exceptions?.estimated_subsidy ?? 0)}
              </span>
            </div>
            <div>
              <span className="cap-l">Actual subsidy</span>
              <span className="cap-n">
                {money(exceptions?.actual_subsidy ?? 0)}
              </span>
            </div>
          </div>
          {Number(exceptions?.undocumented ?? 0) > 0 && (
            <p className="sheet-empty">
              {exceptions?.undocumented} approved exception
              {exceptions?.undocumented === 1 ? '' : 's'} still without
              post-event actuals.
            </p>
          )}
        </section>

        {/* ---------- data quality ---------- */}
        <section className="sheet-section">
          <h2>Data behind this report</h2>
          <table className="sheet-table">
            <tbody>
              <tr>
                <td>Events in period</td>
                <td className="num">{completeness?.events_in_period ?? 0}</td>
                <td>Closed out</td>
                <td className="num">{completeness?.closed_out ?? 0}</td>
              </tr>
              <tr>
                <td>With actual costs</td>
                <td className="num">{completeness?.with_actual_costs ?? 0}</td>
                <td>Cost capture</td>
                <td className="num strong">{capture}%</td>
              </tr>
            </tbody>
          </table>
          <p className="sheet-empty">
            Cost capture affects the cost and contribution figures only. What
            was charged and what it would have cost externally are computed from
            prices, so they are complete regardless.
          </p>
        </section>

        <footer className="sheet-foot">
          <span>Central College Events &amp; Conferences</span>
          <span>
            Generated{' '}
            {new Date().toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </footer>
      </article>

      <div className="no-print" style={{ marginTop: '1.5rem' }}>
        <Link href="/staff/manage/reports" className="backlink-inline">
          &larr; All reports
        </Link>
      </div>
    </>
  );
}
