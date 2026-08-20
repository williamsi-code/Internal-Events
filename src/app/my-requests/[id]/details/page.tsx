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

  // The details step is only meaningful once the classification is
  // settled and acknowledged - before that there is no price tier,
  // so there is nothing honest to show.
  const ready =
    !!state.classification &&
    state.classification !== 'needs_management_review' &&
    !!state.acknowledged_at;

  if (!ready) {
    return (
      <>
        <Masthead />
        <main id="main">
          <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '48rem' }}>
            <Link href={`/my-requests/${id}`} className="backlink-inline">
              &larr; Back to this request
            </Link>
            <div className="card">
              <h2>Not ready yet</h2>
              <p className="hint">
                {state.classification
                  ? 'Confirm how your event has been classified first. Menu prices depend on it.'
                  : 'The events office is still reviewing your request. Once it has been classified you can choose your menu.'}
              </p>
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

  const [menu, existing] = await Promise.all([
    getMenuForRequest(id),
    getSelections(id),
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
              Choose your menu and confirm how the room should be set up. Once
              you confirm, your event moves from tentative to confirmed on the
              campus schedule.
            </p>
          </div>

          <DetailsForm
            requestId={id}
            state={state}
            menu={menu}
            existing={existing}
          />
        </div>
      </main>
    </>
  );
}