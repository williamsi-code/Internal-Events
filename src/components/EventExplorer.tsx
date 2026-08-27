'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { EventRow } from '@/lib/reports';
import type { SpaceRow } from '@/lib/scheduler';

const money = (v: string) =>
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const FOOD_LABEL: Record<string, string> = {
  central_dining: 'Central Catering',
  outside_caterer: 'Outside caterer',
  donated: 'Donated',
  no_food: 'No food',
};

export default function EventExplorer({
  events,
  spaces,
  filters,
}: {
  events: EventRow[];
  spaces: SpaceRow[];
  filters: Record<string, string>;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    from: filters.from ?? '',
    to: filters.to ?? '',
    classification: filters.classification ?? '',
    status: filters.status ?? '',
    spaceId: filters.spaceId ?? '',
    department: filters.department ?? '',
    foodSource: filters.foodSource ?? '',
    search: filters.search ?? '',
  });

  function apply() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
    router.push(`/staff/manage/reports/events?${params.toString()}`);
  }

  function clear() {
    setF({
      from: '',
      to: '',
      classification: '',
      status: '',
      spaceId: '',
      department: '',
      foodSource: '',
      search: '',
    });
    router.push('/staff/manage/reports/events');
  }

  /** Client-side CSV so no round trip and no temporary file. */
  function exportCsv() {
    const head = [
      'Reference', 'Event', 'Date', 'Status', 'Classification',
      'Department', 'Requester', 'Space', 'Attendance',
      'Charged', 'Actual cost', 'Food sources', 'Closed out',
    ];
    const rows = events.map((e) => [
      e.reference_code, e.event_name, e.event_date, e.status,
      e.classification ?? '', e.department_org, e.requester_name,
      e.space_name ?? '', e.attendance, e.charged, e.true_cost,
      e.food_sources, e.closed ? 'yes' : 'no',
    ]);
    const csv = [head, ...rows]
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `central-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = events.reduce(
    (acc, e) => ({
      attendance: acc.attendance + Number(e.attendance || 0),
      charged: acc.charged + Number(e.charged || 0),
      cost: acc.cost + Number(e.true_cost || 0),
    }),
    { attendance: 0, charged: 0, cost: 0 }
  );

  return (
    <>
      <div className="explorer-filters">
        <div className="field">
          <label htmlFor="ex-search">Search</label>
          <input
            id="ex-search"
            type="text"
            placeholder="Event name or reference"
            value={f.search}
            onChange={(e) => setF({ ...f, search: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </div>
        <div className="field">
          <label htmlFor="ex-from">From</label>
          <input
            id="ex-from"
            type="date"
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ex-to">To</label>
          <input
            id="ex-to"
            type="date"
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ex-class">Classification</label>
          <select
            id="ex-class"
            value={f.classification}
            onChange={(e) => setF({ ...f, classification: e.target.value })}
          >
            <option value="">Any</option>
            <option value="internal">Internal</option>
            <option value="affiliated">Affiliated</option>
            <option value="external">External</option>
            <option value="needs_management_review">Needs review</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ex-status">Status</label>
          <select
            id="ex-status"
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
          >
            <option value="">Any</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="info_requested">Awaiting requester</option>
            <option value="classified">Classified</option>
            <option value="details_pending">Details pending</option>
            <option value="pending_final_review">Final review</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="denied">Denied</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ex-space">Space</label>
          <select
            id="ex-space"
            value={f.spaceId}
            onChange={(e) => setF({ ...f, spaceId: e.target.value })}
          >
            <option value="">Any</option>
            {spaces.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ex-food">Food source</label>
          <select
            id="ex-food"
            value={f.foodSource}
            onChange={(e) => setF({ ...f, foodSource: e.target.value })}
          >
            <option value="">Any</option>
            <option value="central_dining">Central Catering</option>
            <option value="outside_caterer">Outside caterer</option>
            <option value="donated">Donated</option>
            <option value="no_food">No food</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ex-dept">Department</label>
          <input
            id="ex-dept"
            type="text"
            value={f.department}
            onChange={(e) => setF({ ...f, department: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </div>
      </div>

      <div className="actions" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
        <button className="btn btn-primary" onClick={apply}>
          Apply filters
        </button>
        <button className="btn btn-ghost" onClick={clear}>
          Clear
        </button>
        {events.length > 0 && (
          <button className="btn btn-ghost" onClick={exportCsv}>
            Export {events.length} to CSV
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          No events match these filters.
        </p>
      ) : (
        <>
          <div className="cap-facts" style={{ marginBottom: '1rem' }}>
            <div className="cap-fact">
              <span className="cap-n">{events.length}</span>
              <span className="cap-l">
                events{events.length === 500 ? ' (limit reached)' : ''}
              </span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">
                {totals.attendance.toLocaleString()}
              </span>
              <span className="cap-l">guests</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">
                {money(String(totals.charged))}
              </span>
              <span className="cap-l">charged</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{money(String(totals.cost))}</span>
              <span className="cap-l">actual cost recorded</span>
            </div>
          </div>

          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Food</th>
                  <th className="num">Guests</th>
                  <th className="num">Charged</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/staff/${e.id}`} className="explorer-link">
                        {e.event_name}
                      </Link>
                      <span className="admin-sub">
                        {e.reference_code} {'\u00b7'} {e.department_org}
                      </span>
                      {e.space_name && (
                        <span className="admin-sub">{e.space_name}</span>
                      )}
                    </td>
                    <td>
                      {new Date(e.event_date + 'T00:00:00').toLocaleDateString(
                        'en-US',
                        { month: 'short', day: 'numeric', year: '2-digit' }
                      )}
                      <span className="admin-sub">
                        {e.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {e.classification ? (
                        <span className={`pill p-${e.classification}`}>
                          {e.classification}
                        </span>
                      ) : (
                        <span className="admin-sub">&mdash;</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-sub">
                        {e.food_sources
                          .split(', ')
                          .filter(Boolean)
                          .map((k) => FOOD_LABEL[k] ?? k)
                          .join(', ') || '\u2014'}
                      </span>
                    </td>
                    <td className="num">{e.attendance}</td>
                    <td className="num">{money(e.charged)}</td>
                    <td className="num">
                      {e.closed ? (
                        money(e.true_cost)
                      ) : (
                        <span className="admin-sub">not closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
