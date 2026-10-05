import type { SessionUser } from './auth';

/**
 * Who may book a room directly.
 *
 * A Central address means someone the College already knows: they
 * have an account because IT gave them one, and letting them take a
 * meeting room without a conversation is the whole point.
 *
 * An outside customer is different. They should not be browsing the
 * campus schedule, and their events need classifying before anything
 * is held.
 */

const CAMPUS_DOMAINS = ['central.edu'];

export function isCampusAddress(email: string | null | undefined) {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return CAMPUS_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`)
  );
}

export interface BookingAccess {
  /** May see the campus schedule at all. */
  canView: boolean;
  /** May take a room directly rather than asking for one. */
  canBook: boolean;
  /** May change other people's bookings. */
  canEdit: boolean;
  /** Books confirm immediately rather than waiting on the office. */
  confirmsImmediately: boolean;
}

export function bookingAccess(user: SessionUser | null): BookingAccess {
  if (!user) {
    return {
      canView: false,
      canBook: false,
      canEdit: false,
      confirmsImmediately: false,
    };
  }

  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  const isViewer = user.roles.includes('schedule_viewer');
  const isCampus = isCampusAddress(user.email);

  return {
    canView: isStaff || isViewer || isCampus,
    // A viewer is security or facilities: they watch the buildings,
    // they do not book them.
    canBook: isStaff || (isCampus && !isViewer),
    canEdit: isStaff,
    confirmsImmediately: isStaff,
  };
}
