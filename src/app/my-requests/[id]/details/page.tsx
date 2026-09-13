import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import DetailsForm from '@/components/DetailsForm';
import { getSessionUser } from '@/lib/auth';
import {
  getDetailsState,
  getMenuForRequest,
  getSelections,
} from '@/lib/requests';
import { getFoodSources, getFacilityCharge } from '@/lib/food-sources';
import { getCapacityState, isReadyForDetails } from '@/lib/capacity-state';
import { getChoiceGroups, getSavedChoices } from '@/lib/choices';

export const metadata = { title: 'Event details' };
export const dynamic = 'force-dynamic';

export default async function DetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const state = await getDetailsState(id, user.id);
  if (!state) notFound();

  const [ready, capacity] = await Promise.all([
    isReadyForDetails(id),
    getCapacityState(id),
  ]);

  // Three things have to be true before a menu means anything: the
  // event is classified, the requester has acknowledged that, and
  // staff have confirmed we can actually do it.
  if (!ready) {
    const waitingOn = !state.classification
      ? 'classification'
      : !state.acknowledged_at
        ? 'acknowledgement'
        : capacity?.outcome === 'alternative_offered'
          ? 'alternative'
          : capacity?.outcome === 'declined'
            ? 'declined'
            : 'capacity';

    const MESSAGES: Record<string, { title: string; body: string }> = {
      classification: {
        title: 'Not ready yet',
        body: 'The events office is still reviewing your request. Once it has been classified you will be able to confirm your details.',
      },
      acknowledgement: {
        title: 'Confirm your classification first',
        body: 'Pricing depends on how your event is classified, so please review and confirm that before choosing a menu.',
      },
      capacity: {
        title: 'We are still checking availability',
        body: 'The events office is confirming the room, the kitchen and the staffing for your date. The menu opens once that is settled, so nothing is wasted if something needs to move.',
      },
      alternative: {
        title: 'There is an alternative waiting for your answer',
        body: 'We cannot do your event exactly as asked and have suggested something else. Let us know whether it works and we will carry on from there.',
      },
      declined: {
        title: 'This event cannot go ahead as asked',
        body: 'The events office has been in touch about why. Send them a message if you would like to look at other options.',
      },
    };

    const m = MESSAGES[waitingOn];

    return (
      <>
        <Masthead />
        <main id="main">
          <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '48rem' }}>
            <Link href={`/my-requests/${id}`} className="backlink-inline">
              &larr; Back to this request
            </Link>
            <div className="card">
              <h2>{m.title}</h2>
              <p className="hint">{m.body}</p>
              <Link
                href={`/my-requests/${id}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Back to this request
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const [menu, existing, foodSources, facility, choiceGroups, savedChoices] =
    await Promise.all([
      getMenuForRequest(id),
      getSelections(id),
      getFoodSources(id),
      getFacilityCharge(id),
      getChoiceGroups(),
      getSavedChoices(id),
    ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem' }}>
          <Link href={`/my-requests/${id}`} className="backlink-inline">
            &larr; Back to this request
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.5rem' }}>
            <h1>Event details</h1>
            <p className="lede">
              Availability is confirmed, so we know we can do this. Choose your
              menu and tell us how the room should be set up.
            </p>
          </div>

          <DetailsForm
            requestId={id}
            state={state}
            menu={menu}
            existing={existing}
            foodSources={foodSources}
            facility={facility}
            choiceGroups={choiceGroups}
            existingChoices={savedChoices}
          />
        </div>
      </main>
    </>
  );
}
