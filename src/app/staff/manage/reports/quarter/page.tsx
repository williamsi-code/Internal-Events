import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import QuarterlyReport from '@/components/QuarterlyReport';
import { getSessionUser } from '@/lib/auth';
import {
  getActivity,
  getFinancials,
  getLostBusiness,
  getCompleteness,
  getExceptions,
  getCapacitySummary,
  getTopSpaces,
  listPeriods,
} from '@/lib/reports';

export const metadata = { title: 'Quarterly report' };
export const dynamic = 'force-dynamic';

export default async function QuarterlyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const sp = await searchParams;
  const periods = await listPeriods();

  const now = new Date();
  const fallback =
    periods.find(
      (p) =>
        new Date(p.starts_on) <= now && new Date(p.ends_on + 'T23:59:59') >= now
    ) ?? periods[0];

  const from =
    sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)
      ? sp.from
      : (fallback?.starts_on ?? '2026-01-01');
  const to =
    sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)
      ? sp.to
      : (fallback?.ends_on ?? '2026-12-31');

  const [
    activity,
    financials,
    lost,
    completeness,
    exceptions,
    capacity,
    topSpaces,
  ] = await Promise.all([
    getActivity(from, to),
    getFinancials(from, to),
    getLostBusiness(from, to),
    getCompleteness(from, to),
    getExceptions(from, to),
    getCapacitySummary(from, to),
    getTopSpaces(from, to),
  ]);

  return (
    <>
      <div className="no-print">
        <Masthead />
      </div>
      <main id="main" className="sheet-page" style={{ maxWidth: '56rem' }}>
        <QuarterlyReport
          from={from}
          to={to}
          periods={periods}
          activity={activity}
          financials={financials}
          lost={lost}
          completeness={completeness}
          exceptions={exceptions}
          capacity={capacity}
          topSpaces={topSpaces}
        />
      </main>
    </>
  );
}
