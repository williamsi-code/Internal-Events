import Link from 'next/link';
import EnquiryForm from '@/components/EnquiryForm';

export const metadata = { title: 'Order catering - Central College' };

/**
 * External ordering.
 *
 * Payment processing is not wired yet, so this routes to a quote
 * request rather than pretending to take money. That is the honest
 * version: an outside customer cannot pay online today, and a
 * checkout that goes nowhere would be worse than none.
 */
export default function OrderPage() {
  return (
    <main id="main" className="shell" style={{ maxWidth: '46rem', paddingTop: '2rem' }}>
      <Link href="/" className="backlink-inline">
        &larr; Central College Catering
      </Link>

      <div className="pagehead" style={{ padding: '0 0 1.25rem' }}>
        <h1>Order catering</h1>
        <p className="lede">
          Weddings, receptions, business meetings and community events. Tell us
          what you have in mind and we will come back with a quote and hold your
          date.
        </p>
      </div>

      <div className="callout c-default" style={{ marginBottom: '1.5rem' }}>
        <strong>How ordering works</strong>
        We quote first, then hold your date on a $300 deposit. A signed
        agreement and a 50% deposit confirms the order, with the balance due
        after the event. Final guest counts are due ten days beforehand.{' '}
        <Link href="/info/internal-policies">Full catering policies</Link>.
      </div>

      <EnquiryForm source="order-page" />

      <div className="tiles" style={{ marginTop: '2rem' }}>
        <Link href="/info/catering-menu" className="tile">
          <h3>The menu</h3>
          <p>
            Breakfast, lunch, buffets, starters and desserts, with prices.
          </p>
        </Link>
        <Link href="/info/event-spaces" className="tile">
          <h3>Event spaces</h3>
          <p>Rooms and outdoor areas on campus, with capacities.</p>
        </Link>
      </div>
    </main>
  );
}
