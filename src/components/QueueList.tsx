'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { URGENCY_BANDS, type QueueRow } from '@/lib/queue-bands';

/**
 * The queue.
 *
 * Grouped by what needs doing rather than by date, because the
 * question someone opens this page with is "what should I do next",
 * not "what is happening soonest".
 */

export default function QueueList({ rows }: { rows: QueueRow[] }) {
  const [search, setSearch] = useState('');
  const [showSettled, setShowSettled] = useState(false);

  const shown = rows.filter((r) => {
    if (!showSettled && r.urgency === 8) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return `${r.event_name} ${r.requester_name} ${r.department_org} ${r.reference_code}`
      .toLowerCase()
      .includes(q);
  });

  const bands = useMemo(() => {
    const out: { label: string; note: string; rows: QueueRow[] }[] = [];
    let floor = -1;
    for (const band of URGENCY_BANDS) {
      const inBand = shown.filter(
        (r) => r.urgency > floor && r.urgency <= band.max
      );
      floor = band.max;
      if (inBand.length > 0) {
        out.push({ label: band.label, note: band.note, rows: inBand });
      }
    }
    return out;
  }, [shown]);

  const settledCount = rows.filter((r) => r.urgency === 8).length;

  return (
    <>
      <div className="admin-bar">
        <input
          type="search"
          placeholder="Find an event, a name, a reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '16rem' }}
          aria-label="Find an event"
        />
        {settledCount > 0 && (
          <button
            className="edit-link"
            onClick={() => setShowSettled((v) => !v)}
          >
            {showSettled
              ? 'Hide settled'
              : `Show ${settledCount} settled`}
          </button>
        )}
      </div>

      {bands.length === 0 ? (
        <p className="empty" style={{ padding: '3rem 0' }}>
          {rows.length === 0
            ? 'Nothing in the queue.'
            : search
              ? 'Nothing matches.'
              : 'Nothing needs you. Everything is either settled or waiting on somebody else.'}
        </p>
      ) : (
        bands.map((band) => (
          <section className="queue-band" key={band.label}>
            <div className="band-head">
              <h2 className={`band-title ${band.label.toLowerCase().replace(/\s+/g, '-')}`}>
                {band.label}
                <span className="band-n">{band.rows.length}</span>
              </h2>
              <span className="band-note">{band.note}</span>
            </div>

            <div className="queue">
              {band.rows.map((r) => (
                <Link
                  href={`/staff/${r.id}`}
                  className={`qcard${r.urgency <= 1 ? ' urgent' : ''}${
                    r.urgency <= 6 ? ' needs-you' : ''
                  }`}
                  key={r.id}
                >
                  <div className="qtop">
                    <span className="qref">{r.reference_code}</span>
                    <span className="qneeds">{r.needs}</span>
                  </div>
                  <div className="qname">{r.event_name}</div>
                  <div className="qmeta">
                    {r.event_date}
                    {r.start_time ? ` \u00b7 ${r.start_time}` : ''}
                    {' \u00b7 '}
                    {r.attendance} guests
                    {r.space_name ? ` \u00b7 ${r.space_name}` : ''}
                  </div>
                  <div className="qmeta">
                    {r.requester_name} {'\u00b7'} {r.department_org}
                  </div>

                  <div className="qflags">
                    {r.room_unavailable && (
                      <span className="pill p-flag">Room taken</span>
                    )}
                    {r.short_notice_state === 'pending' && (
                      <span className="pill p-flag">Short notice</span>
                    )}
                    {r.classification && (
                      <span className={`pill p-${r.classification}`}>
                        {r.classification.replace(/_/g, ' ')}
                      </span>
                    )}
                    {r.days_away >= 0 ? (
                      <span className="qdays">
                        {r.days_away === 0
                          ? 'Today'
                          : r.days_away === 1
                            ? 'Tomorrow'
                            : `in ${r.days_away} days`}
                      </span>
                    ) : (
                      <span className="qdays past">
                        {-r.days_away} days ago
                      </span>
                    )}
                    {r.waiting_days > 2 && r.urgency <= 6 && (
                      <span className="qwaiting">
                        waiting {r.waiting_days} days
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
