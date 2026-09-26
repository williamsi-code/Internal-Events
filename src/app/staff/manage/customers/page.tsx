import { redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import CustomerList from '@/components/CustomerList';
import { getSessionUser } from '@/lib/auth';
import {
  listCustomers,
  listUnlinkedEvents,
  getCustomerSummary,
} from '@/lib/customers';

export const metadata = { title: 'Customers - back office' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const [customers, unlinked, summary] = await Promise.all([
    listCustomers(),
    listUnlinkedEvents(),
    getCustomerSummary(),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="pagehead">
          <h1>Customers</h1>
          <p className="lede">
            Who we cook for, and what they have asked for before. The same
            department booking three times a year is one customer, not three
            unconnected events.
          </p>
        </div>

        <div className="shell" style={{ maxWidth: '58rem' }}>
          <div className="cap-facts">
            <div className="cap-fact">
              <span className="cap-n">{summary?.active ?? 0}</span>
              <span className="cap-l">customers</span>
            </div>
            <div className="cap-fact">
              <span className="cap-n">{summary?.repeat_customers ?? 0}</span>
              <span className="cap-l">have come back</span>
            </div>
            <div
              className={`cap-fact${
                (summary?.unlinked_events ?? 0) > 0 ? ' warn' : ''
              }`}
            >
              <span className="cap-n">{summary?.unlinked_events ?? 0}</span>
              <span className="cap-l">events with nobody attached</span>
            </div>
          </div>

          <CustomerList customers={customers} unlinked={unlinked} />
        </div>
      </main>
    </>
  );
}
