import { redirect } from 'next/navigation';
import Link from 'next/link';
import OrderForm from '@/components/OrderForm';
import { getSessionUser } from '@/lib/auth';
import { getPublicMenu, getOrderSpaces } from '@/lib/orders';

export const metadata = { title: 'Order catering - Central College' };
export const dynamic = 'force-dynamic';

export default async function OrderPage() {
  const user = await getSessionUser();

  // Ordering needs an account, so the customer can follow their order
  // afterwards. Everything before this point is open.
  if (!user) redirect('/sign-in?next=/order');

  const [menu, spaces] = await Promise.all([
    getPublicMenu(),
    getOrderSpaces(),
  ]);

  return (
    <>
      <div className="order-head">
        <div className="order-head-inner">
          <Link href="/" className="wordmark light">
            Central <span>College</span>
          </Link>
          <span className="order-head-unit">Catering</span>
          <span className="order-head-right">
            {user.full_name} {'\u00b7'}{' '}
            <Link href="/my-requests">My orders</Link>
          </span>
        </div>
      </div>

      <main id="main">
        <div className="pagehead">
          <h1>Order catering</h1>
          <p className="lede">
            Choose a date, a space and a menu. Nothing is booked until we confirm
            availability and take a deposit &mdash; so take your time and change
            your mind.
          </p>
        </div>

        <div className="shell">
          <div className="callout c-default" style={{ marginBottom: '1.5rem' }}>
            <strong>How this works</strong>
            You place an order, we confirm the date and room, then a $300
            deposit holds it. A signed agreement and a 50% deposit confirms
            everything, with the balance due after the event. Final guest counts
            are due ten days beforehand.{' '}
            <Link href="/info/internal-policies">Full catering policies</Link>.
          </div>

          <OrderForm
            menu={menu}
            spaces={spaces}
            defaultName={user.full_name}
          />
        </div>
      </main>
    </>
  );
}
