import Link from 'next/link';
import type { CapacityState } from '@/lib/capacity-state';

/**
 * Where an event stands, for the requester.
 *
 * Once availability is confirmed this is the way into whichever step
 * is next, so it has to name that step rather than saying "details"
 * and leaving them to find out.
 */

export default function CapacityStatus({
  state,
  acknowledged,
  requestId,
  hasCentral,
  stage,
}: {
  state: CapacityState | null;
  acknowledged: boolean;
  requestId: string;
  hasCentral: boolean;
  /** waiting, menu, details or done. */
  stage: string;
}) {
  if (!acknowledged) return null;
  if (state?.outcome === 'alternative_offered' && !state.response) return null;

  if (state?.outcome === 'proceed') {
    if (stage === 'done') {
      return (
        <div className="sec">
          <div className="sec-head">
            <h3>Your details are with us</h3>
          </div>
          <div className="callout c-default">
            <strong>Nothing more to do for now</strong>
            The events office is giving everything a final check. You will hear
            back shortly.
          </div>
        </div>
      );
    }

    const onMenu = stage === 'menu';

    return (
      <div className="sec">
        <div className="sec-head">
          <h3>{onMenu ? 'Time to choose your menu' : 'Almost there'}</h3>
        </div>
        <div className="callout c-default">
          <strong>We can do this</strong>
          {onMenu
            ? 'The room, the kitchen and the staffing all work. Choose what you would like to serve, and the room setup comes after.'
            : hasCentral
              ? 'Your menu is settled. Now tell us how the room should be arranged.'
              : 'The room and the staffing work. Check the details of your event and confirm them.'}
        </div>
        <div className="actions">
          <Link
            href={`/my-requests/${requestId}/${onMenu ? 'menu' : 'details'}`}
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            {onMenu
              ? 'Choose your menu'
              : hasCentral
                ? 'Set up the room'
                : 'Check your event details'}
          </Link>
          {!onMenu && hasCentral && (
            <Link
              href={`/my-requests/${requestId}/menu`}
              className="edit-link"
            >
              Change the menu
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (state?.outcome === 'declined') {
    return (
      <div className="sec">
        <div className="sec-head">
          <h3>Availability</h3>
        </div>
        <div className="callout c-flag">
          <strong>We are not able to take this on</strong>
          {state.concerns ?? 'The events office has been in touch about why.'}
        </div>
      </div>
    );
  }

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Checking availability</h3>
      </div>
      <div className="callout c-warn">
        <strong>With the events office</strong>
        {hasCentral
          ? 'They are confirming the room, the kitchen and the staffing for your date. The menu opens once that is settled, so nothing is wasted if something needs to move.'
          : 'They are confirming the room and the staffing for your date.'}
      </div>
    </div>
  );
}
