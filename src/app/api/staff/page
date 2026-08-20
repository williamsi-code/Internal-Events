import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import StaffQueue from '@/components/StaffQueue';
import { getSessionUser } from '@/lib/auth';
import { listRequests } from '@/lib/requests';

export const metadata = { title: 'Request queue' };
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const requests = await listRequests();

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Request queue</h1>
          <p className="lede">
            Every request that has been submitted. Flagged items are those where
            the matrix does not settle the classification, or where the
            requester&rsquo;s answers point somewhere other than their event type
            usually does.
          </p>
        </div>
        <div className="shell">
          <StaffQueue requests={requests} />
        </div>
      </main>
    </>
  );
}