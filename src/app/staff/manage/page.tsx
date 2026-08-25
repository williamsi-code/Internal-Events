import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Back office' };

export default async function ManagePage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Back office</h1>
          <p className="lede">
            Everything the request workflow reads from. Changes here appear on
            the public pages and in new requests immediately.
          </p>
        </div>
        <div className="shell">
          <div className="tiles">
            <Link href="/staff/manage/menu" className="tile primary">
              <h3>Catering menu</h3>
              <p>
                Items, descriptions, minimums, allergens, and the four price
                tiers. Price changes take effect tomorrow and leave existing
                quotes alone.
              </p>
            </Link>
            <Link href="/staff/manage/spaces" className="tile">
              <h3>Event spaces</h3>
              <p>
                Rooms, capacities, and whether catering is permitted. Spaces are
                hidden rather than deleted, so past events keep their location.
              </p>
            </Link>
            <Link href="/staff/manage/policies" className="tile">
              <h3>Policy pages</h3>
              <p>
                Internal and external event policies as published on the public
                site.
              </p>
            </Link>
            <Link href="/staff/manage/people" className="tile">
              <h3>People and access</h3>
              <p>
                Who can reach the queue, the schedule, and this back office.
                Everyone else can only submit and track their own events.
              </p>
            </Link>
          </div>

          <div className="callout c-default" style={{ marginTop: '1.5rem' }}>
            <strong>Event types and classification are not edited here</strong>
            The classification matrix lives in the database and changes rarely.
            Editing it affects how events are classified, so it is deliberately
            a deliberate act rather than a screen anyone can reach.
          </div>
        </div>
      </main>
    </>
  );
}
