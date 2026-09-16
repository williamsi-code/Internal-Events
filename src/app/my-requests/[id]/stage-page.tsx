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
import { getCapacityState } from '@/lib/capacity-state';
import { getChoiceGroups, getSavedChoices } from '@/lib/choices';
import { getOptionsForSpace, getSelectedOptions } from '@/lib/setup-options';
import { one } from '@/lib/db';

/**
 * The menu step and the details step share this page, rendered twice
 * under two routes. What differs is the stage, the heading, and which
 * half of the form is on screen.
 */

export async function renderStage(
  id: string,
  stage: 'menu' | 'details'
) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const state = await getDetailsState(id, user.id);
  if (!state) notFound();

  const [capacity, stageRow] = await Promise.all([
    getCapacityState(id),
    one<{ stage: string; has_central: boolean }>(
      `SELECT details_stage($1) AS stage,
              has_central_dining($1) AS has_central`,
      [id]
    ),
  ]);

  const actual = stageRow?.stage ?? 'waiting';
  const hasCentral = stageRow?.has_central ?? true;

  // Not ready for either step yet: explain which of the three things
  // is outstanding rather than simply refusing.
  if (actual === 'waiting') {
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
        body: 'The events office is still reviewing your request. Once it has been classified you will be able to carry on.',
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

  // An event with no Central catering has no menu step to visit.
  if (stage === 'menu' && !hasCentral) {
    redirect(`/my-requests/${id}/details`);
  }

  // The room is settled by this point, so the checklist can be the
  // real one for that room rather than a generic list.
  const space = await one<{ space_id: string | null }>(
    'SELECT space_id FROM event_requests WHERE id = $1',
    [id]
  );

  const [
    menu,
    existing,
    foodSources,
    facility,
    choiceGroups,
    savedChoices,
    setupOptions,
    savedSetup,
  ] = await Promise.all([
    getMenuForRequest(id),
    getSelections(id),
    getFoodSources(id),
    getFacilityCharge(id),
    getChoiceGroups(),
    getSavedChoices(id),
    space?.space_id ? getOptionsForSpace(space.space_id) : Promise.resolve([]),
    getSelectedOptions(id),
  ]);

  const heading =
    stage === 'menu'
      ? { title: 'Choose your menu', step: 'Step 1 of 2' }
      : {
          title: hasCentral ? 'Final details' : 'Check your event details',
          step: hasCentral ? 'Step 2 of 2' : null,
        };

  const lede =
    stage === 'menu'
      ? 'Availability is confirmed, so we know we can do this. Choose what you would like to serve; the room setup comes next.'
      : hasCentral
        ? 'Your menu is settled. Now tell us how the room should be arranged and what you need in it.'
        : 'Availability is confirmed. Check the details below are right and confirm them \u2014 there is no menu to choose, since Central is not providing the food.';

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem' }}>
          <Link href={`/my-requests/${id}`} className="backlink-inline">
            &larr; Back to this request
          </Link>

          <div className="pagehead" style={{ padding: '0 0 1.5rem' }}>
            {heading.step && (
              <span className="stage-step">{heading.step}</span>
            )}
            <h1>{heading.title}</h1>
            <p className="lede">{lede}</p>
          </div>

          {hasCentral && (
            <ol className="stage-track" aria-label="Where you are">
              <li className={stage === 'menu' ? 'here' : 'done'}>
                <Link href={`/my-requests/${id}/menu`}>Menu</Link>
              </li>
              <li
                className={
                  stage === 'details'
                    ? 'here'
                    : actual === 'details' || actual === 'done'
                      ? ''
                      : 'later'
                }
              >
                {actual === 'menu' ? (
                  <span>Setup and details</span>
                ) : (
                  <Link href={`/my-requests/${id}/details`}>
                    Setup and details
                  </Link>
                )}
              </li>
            </ol>
          )}

          <DetailsForm
            requestId={id}
            state={state}
            menu={menu}
            existing={existing}
            foodSources={foodSources}
            facility={facility}
            choiceGroups={choiceGroups}
            existingChoices={savedChoices}
            setupOptions={setupOptions}
            existingSetup={savedSetup.map((s) => ({
              optionId: s.option_id,
              count: s.count,
            }))}
            stage={stage}
          />
        </div>
      </main>
    </>
  );
}
