import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import ImportBookings from '@/components/ImportBookings';
import { getSessionUser } from '@/lib/auth';
import { listImportBatches } from '@/lib/imports';

export const metadata = { title: 'Import bookings - back office' };
export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const batches = await listImportBatches();

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '62rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Import room bookings</h1>
            <p className="lede">
              Bring bookings in from a spreadsheet so the schedule shows what is
              really happening in each room.
            </p>
          </div>

          <div className="callout c-default" style={{ marginBottom: '1.5rem' }}>
            <strong>Imported rows become room holds, not events</strong>
            They occupy the space so the scheduler is accurate and conflicts are
            caught, but they have no requester, menu or classification &mdash;
            because they are not catering events, and counting them as such
            would distort every figure in the quarterly report.
          </div>

          <ImportBookings batches={batches} />
        </div>
      </main>
    </>
  );
}
