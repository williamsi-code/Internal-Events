'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { QueueRow } from '@/lib/requests';

const FILTERS: [string, string][] = [
  ['open', 'All open'],
  ['needs_decision', 'Needs classification'],
  ['flagged', 'Flagged'],
  ['info_requested', 'Awaiting requester'],
  ['classified', 'Classified'],
  ['all', 'Everything'],
];

const STATUS_PILL: Record<string, [string, string]> = {
  submitted: ['p-submitted', 'New'],
  under_review: ['p-review', 'Under review'],
  info_requested: ['p-info', 'Awaiting requester'],
  classified: ['p-classified', 'Classified'],
  details_pending: ['p-classified', 'Details pending'],
  confirmed: ['p-confirmed', 'Confirmed'],
  completed: ['p-confirmed', 'Completed'],
  cancelled: ['p-review', 'Cancelled'],
  denied: ['p-flag', 'Denied'],
};

function matches(r: QueueRow, f: string) {
  switch (f) {
    case 'open':
      return !['confirmed', 'completed', 'cancelled', 'denied'].includes(r.status);
    case 'needs_decision':
      return !r.current_classification && r.status !== 'info_requested';
    case 'flagged':
      return r.deviates_from_type || r.always_review === true || !r.event_type_name;
    case 'info_requested':
      return r.status === 'info_requested';
    case 'classified':
      return !!r.current_classification;
    default:
      return true;
  }
}

function daysUntil(date: string) {
  const ms = new Date(date + 'T00:00:00').getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

export default function StaffQueue({ requests }: { requests: QueueRow[] }) {
  const [filter, setFilter] = useState('open');
  const shown = requests.filter((r) => matches(r, filter));

  return (
    <>
      <div className="filters" role="group" aria-label="Filter requests">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            className="chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}{' '}
            <span className="n">
              {requests.filter((r) => matches(r, key)).length}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          Nothing in this view.
        </p>
      ) : (
        <div className="queue">
          {shown.map((r) => {
            const [cls, label] = STATUS_PILL[r.status] ?? ['p-submitted', r.status];
            const days = daysUntil(r.event_date);
            return (
              <Link href={`/staff/${r.id}`} className="qcard" key={r.id}>
                <div className="qtop">
                  <span className="qref">{r.reference_code}</span>
                  <span className={`pill ${cls}`}>{label}</span>
                </div>
                <div className="qname">{r.event_name}</div>
                <div className="qmeta">
                  {new Date(r.event_date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {' \u00b7 '}
                  {r.estimated_attendance} guests
                  {' \u00b7 '}
                  {r.department_org}
                </div>
                <div className="qflags">
                  {r.event_type_name && (
                    <span className="pill p-type">{r.event_type_name}</span>
                  )}
                  {r.deviates_from_type && (
                    <span className="pill p-flag">Answers differ from type</span>
                  )}
                  {r.always_review && (
                    <span className="pill p-review">Always reviewed</span>
                  )}
                  {!r.event_type_name && (
                    <span className="pill p-review">Type not listed</span>
                  )}
                  {r.unread_replies > 0 && (
                    <span className="pill p-info">Requester replied</span>
                  )}
                  {days <= 21 && days >= 0 && !r.current_classification && (
                    <span className="pill p-soon">In {days} days</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}