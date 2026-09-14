import Link from 'next/link';
import type { CapacityState } from '@/lib/capacity-state';

/**
 * Where an event stands on capacity, for the requester.
 *
 * The next step waits on this, so the requester needs to know it
 * exists rather than wondering why nothing has appeared.
 */

export default function CapacityStatus({
  state,
  acknowledged,
  requestId,
  hasCentral,
}: {
  state: CapacityState | null;
  acknowledged: boolean;
  requestId: string;
  hasCentral: boolean;
}) {
  if (!acknowledged) return null;
  if (state?.outcome === 'alternative_offered' && !state.response) return null;

  if (state?.outcome === 'proceed') {
    return (
      <div className="sec">
        <div className="sec-head">
          <h3>Availability confirmed</h3>
        </div>
        <div className="callout c-default">
          <strong>We can do this</strong>
          {hasCentral
            ? 'The room, the kitchen and the staffing all work. Next, choose your menu and tell us how the room should be set up.'
            : 'The room and the staffing work. Next, check the details of your event and confirm them.'}
        </div>
        <div className="actions">
          <Link
            href={`/my-requests/${requestId}/details`}
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            {hasCentral
              ? 'Choose your menu and details'
              : 'Check your event details'}
          </Link>
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
