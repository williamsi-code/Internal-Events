import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import CustomerDetail from '@/components/CustomerDetail';
import { getSessionUser } from '@/lib/auth';
import {
  getCustomer,
  getContacts,
  getCustomerEvents,
} from '@/lib/customers';

export const metadata = { title: 'Customer' };
export const dynamic = 'force-dynamic';

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');
  if (!isStaff) redirect('/');

  const isNew = id === 'new';
  const customer = isNew ? null : await getCustomer(id);
  if (!isNew && !customer) notFound();

  const [contacts, events] = await Promise.all([
    isNew ? Promise.resolve([]) : getContacts(id),
    isNew ? Promise.resolve([]) : getCustomerEvents(id),
  ]);

  return (
    <>
      <Masthead />
      <main id="main">
        <div className="shell" style={{ paddingTop: '1.5rem', maxWidth: '54rem' }}>
          <Link href="/staff/manage/customers" className="backlink-inline">
            &larr; All customers
          </Link>

          <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
            <h1>{customer ? customer.name : 'New customer'}</h1>
            {customer && (
              <p className="lede">
                {customer.primary_contact}
                {customer.last_event
                  ? ` \u00b7 last event ${customer.last_event}`
                  : ' \u00b7 nothing booked yet'}
              </p>
            )}
          </div>

          <CustomerDetail
            customer={customer}
            contacts={contacts}
            events={events}
          />
        </div>
      </main>
    </>
  );
}
