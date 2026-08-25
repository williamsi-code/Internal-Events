'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { QueueRow } from '@/lib/requests';

const FILTERS: [string, string][] = [
  ['open', 'All open'],
  ['needs_decision', 'Needs classification'],
  ['final_review', 'Final review'],
  ['headcount', 'Headcount due'],
  ['flagged', 'Flagged'],
  ['info_requested', 'Awaiting requester'],
  ['all', 'Everything'],
];

const STATUS_PILL: Record<string, [string, string]> = {
  submitted: ['p-submitted', 'New'],
  under_review: ['p-review', 'Under review'],
  info_requested: ['p-info', 'Awaiting requester'],
  classified: ['p-classified', 'Classified'],
  details_pending: ['p-classified', 'Details pending'],
  pending_final_review: ['p-final', 'Final review'],
  confirmed: ['p-confirmed', 'Confirmed'],
  completed: ['p-confirmed', 'Completed'],
  cancelled: ['p-review', 'Cancelled'],
  denied: ['p-flag', 'Denied'],
};

const LIVE = ['confirmed', 'pending_final_review', 'details_pending'];

function daysUntil(date: string) {
  const ms = new Date(date + 'T00:00:00').getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

/** Still owes a count, and the event has not happened yet. */
function headcountOutstanding(r: QueueRow) {
  return (
    !r.headcount_submitted_at &&
    LIVE.includes(r.status) &&
    daysUntil(r.event_date) >= 0
  );
}

/** How much trouble an undecided request is in. Lead time matters more
 *  for larger events, so a 200-guest event a week out is more urgent
 *  than a 10-person meeting on the same day. */
function urgency(r: QueueRow): 'overdue' | 'soon' | null {
  if (r.current_classification) return null;
  if (['cancelled', 'denied', 'completed'].includes(r.status)) return null;

  const days = daysUntil(r.event_date);
  const large = r.estimated_attendance >= 100;

  if (days < 0) return 'overdue';
  if (days <= (large ? 10 : 5)) return 'overdue';
  if (days <= 21) return 'soon';
  return null;
}

function matches(r: QueueRow, f: string) {
  switch (f) {
    case 'open':
      return !['completed', 'cancelled', 'denied'].includes(r.status);
    case 'needs_decision':
      return !r.current_classification && r.status !== 'info_requested';
    case 'final_review':
      return r.status === 'pending_final_review';
    case 'headcount':
      return headcountOutstanding(r) && (r.days_to_headcount ?? 99) <= 7;
    case 'flagged':
      return r.deviates_from_type || r.always_review === true || !r.event_type_name;
    case 'info_requested':
      return r.status === 'info_requested';
    default:
      return true;
  }
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
            const hcDays = r.days_to_headcount;
            const needsCount = headcountOutstanding(r);

            return (
              <Link href={`/staff/${r.id}`} className="qcard" key={r.id}>
                <div className="qtop">
                  <span className="qref">{r.reference_code}</span>
                  <span className={`pill ${cls}`}>{label}</span>
                </div>
                <div className="qname">{r.event_name}</div>
                <div className="qmeta">
                  {new Date(r.event_date + 'T00:00:00').toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' }
                  )}
                  {' \u00b7 '}
                  {r.final_attendance ?? r.estimated_attendance} guests
                  {r.final_attendance ? ' (final)' : ''}
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

                  {needsCount && hcDays !== null && hcDays < 0 && (
                    <span className="pill p-headcount-late">
                      Headcount {-hcDays} day{hcDays === -1 ? '' : 's'} overdue
                    </span>
                  )}
                  {needsCount && hcDays !== null && hcDays >= 0 && hcDays <= 7 && (
                    <span className="pill p-headcount">
                      Headcount due{' '}
                      {hcDays === 0 ? 'today' : `in ${hcDays} day${hcDays === 1 ? '' : 's'}`}
                    </span>
                  )}
                  {r.headcount_submitted_at && (
                    <span className="pill p-count-in">Count in</span>
                  )}

                  {urgency(r) === 'overdue' && (
                    <span className="pill p-overdue">
                      {days < 0
                        ? 'Event has passed, still unclassified'
                        : `Undecided, ${days} day${days === 1 ? '' : 's'} out`}
                    </span>
                  )}
                  {urgency(r) === 'soon' && (
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
