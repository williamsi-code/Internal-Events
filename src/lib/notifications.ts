import { query } from './db';

/**
 * What is waiting on this person.
 *
 * Computed on page load rather than pushed. Everything here is a
 * question the database can already answer, so asking it when a page
 * renders is both accurate and free of moving parts.
 *
 * The rule for inclusion is narrow: it must be something this person
 * can act on. A list of what other people owe you becomes noise, and
 * noise gets ignored.
 */

export interface Notice {
  id: string;
  kind: 'action' | 'waiting' | 'overdue';
  title: string;
  detail: string;
  href: string;
  count?: number;
}

export async function getNotices(
  userId: string,
  isStaff: boolean
): Promise<Notice[]> {
  const notices: Notice[] = [];

  /* ---------- everyone: their own events ---------- */

  const mine = await query<{
    id: string;
    reference_code: string;
    event_name: string;
    needs_ack: boolean;
    needs_details: boolean;
    question_waiting: boolean;
    headcount_days: number | null;
    unread_replies: number;
  }>(
    `SELECT r.id, r.reference_code, r.event_name,
            (cd.classification IS NOT NULL
             AND cd.classification <> 'needs_management_review'
             AND cd.acknowledged_at IS NULL) AS needs_ack,
            (r.status = 'details_pending') AS needs_details,
            (r.status = 'info_requested') AS question_waiting,
            CASE WHEN r.headcount_submitted_at IS NULL
                  AND r.status IN ('confirmed','pending_final_review')
                  AND r.event_date >= CURRENT_DATE
                 THEN (r.headcount_due_on - CURRENT_DATE)
            END AS headcount_days,
            (SELECT count(*) FROM request_messages m
              WHERE m.request_id = r.id
                AND NOT m.is_internal
                AND m.author_id IS DISTINCT FROM r.requester_id
                AND m.read_at IS NULL) AS unread_replies
       FROM event_requests r
       LEFT JOIN classification_decisions cd
              ON cd.request_id = r.id AND cd.is_current
      WHERE r.requester_id = $1
        AND r.status NOT IN ('cancelled','denied','completed','draft')`,
    [userId]
  );

  for (const r of mine) {
    if (r.question_waiting) {
      notices.push({
        id: `q-${r.id}`,
        kind: 'action',
        title: 'The events office asked you a question',
        detail: r.event_name,
        href: `/my-requests/${r.id}`,
      });
    } else if (Number(r.unread_replies) > 0) {
      notices.push({
        id: `msg-${r.id}`,
        kind: 'action',
        title: 'New message from the events office',
        detail: r.event_name,
        href: `/my-requests/${r.id}`,
      });
    }
    if (r.needs_ack) {
      notices.push({
        id: `ack-${r.id}`,
        kind: 'action',
        title: 'Classification needs your confirmation',
        detail: r.event_name,
        href: `/my-requests/${r.id}`,
      });
    }
    if (r.needs_details) {
      notices.push({
        id: `det-${r.id}`,
        kind: 'action',
        title: 'Choose your menu and setup details',
        detail: r.event_name,
        href: `/my-requests/${r.id}/details`,
      });
    }
    if (r.headcount_days !== null && r.headcount_days < 0) {
      notices.push({
        id: `hc-${r.id}`,
        kind: 'overdue',
        title: `Final guest count is ${-r.headcount_days} day${
          r.headcount_days === -1 ? '' : 's'
        } overdue`,
        detail: r.event_name,
        href: `/my-requests/${r.id}`,
      });
    } else if (r.headcount_days !== null && r.headcount_days <= 3) {
      notices.push({
        id: `hc-${r.id}`,
        kind: 'action',
        title:
          r.headcount_days === 0
            ? 'Final guest count is due today'
            : `Final guest count due in ${r.headcount_days} day${
                r.headcount_days === 1 ? '' : 's'
              }`,
        detail: r.event_name,
        href: `/my-requests/${r.id}`,
      });
    }
  }

  /* ---------- everyone: their own enquiries ---------- */

  const myEnquiries = await query<{
    id: string;
    reference_code: string;
    event_type: string | null;
    unread: number;
  }>(
    `SELECT e.id, e.reference_code, e.event_type,
            (SELECT count(*) FROM enquiry_messages m
              WHERE m.enquiry_id = e.id
                AND m.is_staff AND NOT m.is_internal
                AND m.read_at IS NULL) AS unread
       FROM enquiries e
      WHERE e.user_id = $1
        AND e.status NOT IN ('closed', 'converted')`,
    [userId]
  );

  for (const e of myEnquiries) {
    if (Number(e.unread) > 0) {
      notices.push({
        id: `enq-${e.id}`,
        kind: 'action',
        title: 'The events office replied to your enquiry',
        detail: e.event_type || e.reference_code,
        href: `/my-requests/enquiries/${e.id}`,
      });
    }
  }

  /* ---------- everyone: rooms they have asked for ---------- */

  const rooms = await query<{
    waiting: number;
    confirmed_unseen: number;
    next_room: string | null;
    next_when: string | null;
  }>(
    `SELECT
       (SELECT count(*) FROM bookings b
         WHERE b.is_quick_booking
           AND b.requested_by = $1
           AND b.quick_state = 'requested'
           AND b.status <> 'released'
           AND b.event_starts_at > now()) AS waiting,

       -- Confirmed since they last looked. The acknowledgement
       -- matters as much as the booking: someone who asked for a room
       -- and heard nothing will ring up to check.
       (SELECT count(*) FROM bookings b
         WHERE b.is_quick_booking
           AND b.requested_by = $1
           AND b.quick_state = 'confirmed'
           AND b.decided_at > now() - INTERVAL '7 days'
           AND b.event_starts_at > now()) AS confirmed_unseen,

       (SELECT s.name FROM bookings b
          JOIN spaces s ON s.id = b.space_id
         WHERE b.is_quick_booking
           AND b.requested_by = $1
           AND b.quick_state = 'confirmed'
           AND b.decided_at > now() - INTERVAL '7 days'
         ORDER BY b.decided_at DESC LIMIT 1) AS next_room,

       (SELECT to_char(b.event_starts_at AT TIME ZONE 'America/Chicago',
                       'Mon FMDD at FMHH12:MI AM')
          FROM bookings b
         WHERE b.is_quick_booking
           AND b.requested_by = $1
           AND b.quick_state = 'confirmed'
           AND b.decided_at > now() - INTERVAL '7 days'
         ORDER BY b.decided_at DESC LIMIT 1) AS next_when`,
    [userId]
  );

  const r = rooms[0];

  if (Number(r?.confirmed_unseen ?? 0) > 0) {
    const n = Number(r.confirmed_unseen);
    notices.push({
      id: 'rooms-confirmed',
      kind: 'waiting',
      title:
        n === 1
          ? `${r.next_room} is booked for you`
          : `${n} room bookings confirmed`,
      detail:
        n === 1 && r.next_when
          ? `${r.next_when}. The events office has confirmed it.`
          : 'The events office has confirmed them',
      href: '/staff/schedule',
      count: n,
    });
  }

  if (Number(r?.waiting ?? 0) > 0) {
    notices.push({
      id: 'rooms-waiting',
      kind: 'waiting',
      title: `${r.waiting} room booking${
        Number(r.waiting) === 1 ? '' : 's'
      } with the events office`,
      detail: 'Held for you pending confirmation',
      href: '/staff/schedule',
      count: Number(r.waiting),
    });
  }

  if (!isStaff) return notices;

  /* ---------- staff: the office's queue ---------- */

  const staff = await query<{
    needs_classification: number;
    final_review: number;
    replies: number;
    enquiries: number;
    caterers_pending: number;
    headcount_overdue: number;
    closeout: number;
    closeout_oldest: number | null;
    facility_undecided: number;
    payments_overdue: number;
    room_requests: number;
    room_requests_soon: number;
  }>(
    `SELECT
       (SELECT count(*) FROM event_requests r
         LEFT JOIN classification_decisions cd
                ON cd.request_id = r.id AND cd.is_current
        WHERE cd.id IS NULL
          AND r.status IN ('submitted','under_review')) AS needs_classification,

       (SELECT count(*) FROM event_requests
         WHERE status = 'pending_final_review') AS final_review,

       (SELECT count(DISTINCT m.request_id) FROM request_messages m
         JOIN event_requests r ON r.id = m.request_id
        WHERE NOT m.is_internal
          AND m.author_id = r.requester_id
          AND m.read_at IS NULL) AS replies,

       (SELECT count(*) FROM enquiries_open
         WHERE status IN ('new','awaiting_staff')) AS enquiries,

       (SELECT count(*) FROM caterers WHERE status = 'pending')
         AS caterers_pending,

       (SELECT count(*) FROM headcount_outstanding WHERE days_remaining < 0)
         AS headcount_overdue,

       (SELECT count(*) FROM quick_bookings_waiting) AS room_requests,

       (SELECT count(*) FROM quick_bookings_waiting
         WHERE event_date <= CURRENT_DATE + 2) AS room_requests_soon,

       (SELECT count(*) FROM awaiting_closeout) AS closeout,
       (SELECT max(days_since) FROM awaiting_closeout) AS closeout_oldest,

       (SELECT count(*) FROM split_catering_events WHERE needs_decision)
         AS facility_undecided,

       (SELECT count(*) FROM payments_outstanding
         WHERE days_remaining IS NOT NULL AND days_remaining < 0)
         AS payments_overdue`
  );

  const s = staff[0];
  if (!s) return notices;

  const add = (
    n: number,
    kind: Notice['kind'],
    id: string,
    singular: string,
    plural: string,
    detail: string,
    href: string
  ) => {
    if (n > 0) {
      notices.push({
        id,
        kind,
        title: `${n} ${n === 1 ? singular : plural}`,
        detail,
        href,
        count: n,
      });
    }
  };

  add(Number(s.replies), 'action', 'staff-replies',
    'requester has replied', 'requesters have replied',
    'Waiting on the events office', '/staff?filter=info_requested');

  add(Number(s.enquiries), 'action', 'staff-enquiries',
    'enquiry needs answering', 'enquiries need answering',
    'People asking before they book', '/staff/enquiries');

  add(Number(s.needs_classification), 'action', 'staff-classify',
    'request needs classifying', 'requests need classifying',
    'Nothing can move until these are decided', '/staff');

  add(Number(s.final_review), 'action', 'staff-final',
    'event awaiting final review', 'events awaiting final review',
    'Details confirmed, waiting to be checked', '/staff');

  add(Number(s.facility_undecided), 'action', 'staff-facility',
    'split event needs a facility charge', 'split events need a facility charge',
    'Central is catering part of these', '/staff');

  // A room request is small but time-critical: the person asking has
  // put it in their diary and is assuming it is theirs.
  if (Number(s.room_requests) > 0) {
    const soon = Number(s.room_requests_soon ?? 0);
    notices.push({
      id: 'staff-rooms',
      kind: soon > 0 ? 'overdue' : 'action',
      title: `${s.room_requests} room booking${
        Number(s.room_requests) === 1 ? '' : 's'
      } to confirm`,
      detail:
        soon > 0
          ? `${soon} of them ${soon === 1 ? 'is' : 'are'} within two days`
          : 'Held on the schedule until you say yes',
      href: '/staff/rooms',
      count: Number(s.room_requests),
    });
  }

  add(Number(s.caterers_pending), 'action', 'staff-caterers',
    'caterer application waiting', 'caterer applications waiting',
    'They cannot be chosen until reviewed', '/staff/manage/caterers');

  add(Number(s.headcount_overdue), 'overdue', 'staff-headcount',
    'headcount is overdue', 'headcounts are overdue',
    'The kitchen orders against these numbers', '/staff');

  add(Number(s.payments_overdue), 'overdue', 'staff-payments',
    'payment is overdue', 'payments are overdue',
    'Past their due date and unsettled', '/staff');

  if (Number(s.closeout) > 0) {
    const oldest = Number(s.closeout_oldest ?? 0);
    notices.push({
      id: 'staff-closeout',
      kind: oldest > 30 ? 'overdue' : 'waiting',
      title: `${s.closeout} event${
        Number(s.closeout) === 1 ? '' : 's'
      } waiting to be closed out`,
      detail:
        oldest > 30
          ? `The oldest is ${oldest} days ago. Reporting depends on these.`
          : 'Actual costs feed the quarterly report',
      href: '/staff/closeout',
      count: Number(s.closeout),
    });
  }

  return notices;
}
