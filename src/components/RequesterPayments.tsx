import type { Payment, PaymentConfig } from '@/lib/payments';

/**
 * What a requester sees about money.
 *
 * There is no pay button, because there is nothing behind one. Being
 * plain about that is better than a disabled control or a checkout
 * that fails - either would waste the requester's time and cost the
 * events office a phone call.
 */

const money = (v: string) =>
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function RequesterPayments({
  payments,
  config,
}: {
  payments: Payment[];
  config: PaymentConfig | null;
}) {
  const visible = payments.filter(
    (p) => !['cancelled'].includes(p.status)
  );
  if (visible.length === 0) return null;

  const outstanding = visible
    .filter((p) => ['requested', 'pending'].includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);

  const overdue = visible.filter(
    (p) =>
      ['requested', 'pending'].includes(p.status) &&
      p.days_remaining !== null &&
      p.days_remaining < 0
  );

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Payments</h3>
      </div>

      {overdue.length > 0 ? (
        <div className="callout c-flag">
          <strong>
            {overdue.length === 1
              ? 'A payment is overdue'
              : `${overdue.length} payments are overdue`}
          </strong>
          Please contact the events office to settle it.
        </div>
      ) : outstanding > 0 ? (
        <div className="callout c-warn">
          <strong>{money(String(outstanding))} outstanding</strong>
          {config?.offline_instructions}
        </div>
      ) : (
        <div className="callout c-default">
          <strong>Nothing outstanding</strong>
          Everything requested so far has been settled.
        </div>
      )}

      <ul className="payment-list plain">
        {visible.map((p) => (
          <li key={p.id}>
            <div className="payment-main">
              <span className="payment-purpose">{p.purpose}</span>
              <span className="payment-meta">
                {p.status === 'paid'
                  ? `Received ${p.paid_at}`
                  : p.status === 'waived'
                    ? 'Waived'
                    : p.due_on
                      ? `Due ${p.due_on}`
                      : 'Due on request'}
              </span>
            </div>
            <div className="payment-right">
              <span className="payment-amount">{money(p.amount)}</span>
              {p.status === 'paid' && (
                <span className="pill p-classified">Paid</span>
              )}
              {p.status === 'waived' && (
                <span className="pill p-cancelled">Waived</span>
              )}
              {['requested', 'pending'].includes(p.status) && (
                <span className="pill p-submitted">Outstanding</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
