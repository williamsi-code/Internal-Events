import { redirect } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import CaterersEditor from '@/components/CaterersEditor';
import { getSessionUser } from '@/lib/auth';
import { listCaterers, getCatererSummary } from '@/lib/caterers';

export const metadata = { title: 'Approved caterers - back office' };
export const dynamic = 'force-dynamic';

export default async function ManageCaterersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [caterers, summary] = await Promise.all([
    listCaterers(),
    getCatererSummary(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '60rem' }}>
          <Link href="/staff/manage" className="backlink-inline">
            &larr; Back office
          </Link>
          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>Approved caterers</h1>
            <p className="lede">
              Only approved caterers with current paperwork appear in the list a
              requester can choose from. Caterers apply through the public form
              and wait here until someone decides.
            </p>
          </div>

          <div className="cap-facts" style={{ marginBottom: '1.5rem' }}>
            <div className={`cap-fact${(summary?.pending ?? 0) > 0 ? ' warn' : ''}`}>
              <span className="cap-n">{summary?.pending ?? 0}</span>
              <span className="cap-l">awaiting review</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{summary?.approved ?? 0}</span>
              <span className="cap-l">approved</span>
            </div>
            <div
              className={`cap-fact${(summary?.lapsing_soon ?? 0) > 0 ? ' warn' : ''}`}
            >
              <span className="cap-n">{summary?.lapsing_soon ?? 0}</span>
              <span className="cap-l">insurance expiring within 60 days</span>
            </div>
          </div>

          <div className="callout c-default" style={{ marginBottom: '1.25rem' }}>
            <strong>Send caterers to the application form</strong>
            <Link href="/caterers/apply">
              {'/caterers/apply'}
            </Link>{' '}
            is public and needs no account. What they submit lands here as
            pending.
          </div>

          <CaterersEditor caterers={caterers} />
        </div>
      </main>
    </>
  );
}
