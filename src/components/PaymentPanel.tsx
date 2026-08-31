'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Payment, PaymentConfig } from '@/lib/payments';

const money = (v: string) =>
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const STATUS_PILL: Record<string, [string, string]> = {
  requested: ['p-submitted', 'Requested'],
  pending: ['p-review', 'Pending'],
  paid: ['p-classified', 'Paid'],
  failed: ['p-flag', 'Failed'],
  refunded: ['p-review', 'Refunded'],
  waived: ['p-cancelled', 'Waived'],
  cancelled: ['p-cancelled', 'Cancelled'],
};

export default function PaymentPanel({
  requestId,
  payments,
  config,
}: {
  requestId: string;
  payments: Payment[];
  config: PaymentConfig | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [depositKind, setDepositKind] = useState('none');

  const [externalRef, setExternalRef] = useState('');
  const [methodNote, setMethodNote] = useState('');
  const [paidOn, setPaidOn] = useState('');

  const outstanding = payments
    .filter((p) => ['requested', 'pending'].includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);
  const paid = payments
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount), 0);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setAdding(false);
      setRecording(null);
      setPurpose('');
      setAmount('');
      setDueOn('');
      setExternalRef('');
      setMethodNote('');
      setPaidOn('');
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Payments</h3>
      </div>

      {!config?.online_enabled && (
        <div className="callout c-default">
          <strong>Online payment is not connected</strong>
          Payments are arranged and recorded by the events office. When a
          processor is connected, requesters will be able to pay from their own
          page and this panel will show it settle automatically.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {payments.length > 0 && (
        <>
          <div className="cap-facts" style={{ marginBottom: '1rem' }}>
            <div className="cap-fact">
              <span className="cap-n">{money(String(paid))}</span>
              <span className="cap-l">received</span>
            </div>
            <div className={`cap-fact${outstanding > 0 ? ' warn' : ''}`}>
              <span className="cap-n">{money(String(outstanding))}</span>
              <span className="cap-l">outstanding</span>
            </div>
          </div>

          <ul className="payment-list">
            {payments.map((p) => {
              const [cls, label] = STATUS_PILL[p.status] ?? [
                'p-submitted',
                p.status,
              ];
              return (
                <li key={p.id}>
                  <div className="payment-main">
                    <span className="payment-purpose">{p.purpose}</span>
                    <span className="payment-meta">
                      {p.reference_code}
                      {p.due_on ? ` \u00b7 due ${p.due_on}` : ''}
                      {p.paid_at ? ` \u00b7 paid ${p.paid_at}` : ''}
                      {p.external_ref ? ` \u00b7 ref ${p.external_ref}` : ''}
                    </span>
                    {p.method_note && (
                      <span className="payment-meta">{p.method_note}</span>
                    )}
                    {p.waived_reason && (
                      <span className="payment-meta">
                        Waived: {p.waived_reason}
                      </span>
                    )}
                  </div>
                  <div className="payment-right">
                    <span className="payment-amount">{money(p.amount)}</span>
                    <span className={`pill ${cls}`}>{label}</span>
                    {['requested', 'pending'].includes(p.status) && (
                      <button
                        className="edit-link"
                        onClick={() =>
                          setRecording(recording === p.id ? null : p.id)
                        }
                      >
                        Record payment
                      </button>
                    )}
                  </div>

                  {recording === p.id && (
                    <div className="payment-record">
                      <div className="grid two">
                        <div className="field">
                          <label htmlFor={`ref-${p.id}`}>Reference</label>
                          <p className="sub">
                            Cheque number, transfer reference, or journal entry.
                          </p>
                          <input
                            id={`ref-${p.id}`}
                            type="text"
                            value={externalRef}
                            onChange={(e) => setExternalRef(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`paid-${p.id}`}>Date received</label>
                          <input
                            id={`paid-${p.id}`}
                            type="date"
                            value={paidOn}
                            onChange={(e) => setPaidOn(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor={`note-${p.id}`}>How it was paid</label>
                        <input
                          id={`note-${p.id}`}
                          type="text"
                          placeholder="Cheque, transfer, departmental journal"
                          value={methodNote}
                          onChange={(e) => setMethodNote(e.target.value)}
                        />
                      </div>
                      <div className="actions">
                        <button
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() =>
                            send({
                              action: 'record',
                              paymentId: p.id,
                              externalRef: externalRef || null,
                              methodNote: methodNote || null,
                              paidOn: paidOn || null,
                            })
                          }
                        >
                          Mark as paid
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={busy || !methodNote.trim()}
                          onClick={() =>
                            send({
                              action: 'waive',
                              paymentId: p.id,
                              reason: methodNote,
                            })
                          }
                        >
                          Waive
                        </button>
                        <button
                          className="edit-link"
                          onClick={() => setRecording(null)}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="sub">
                        Waiving needs a reason &mdash; put it in the how it was
                        paid field.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {adding ? (
        <div className="payment-record">
          <div className="grid two">
            <div className="field">
              <label htmlFor="pay-purpose">What is this for?</label>
              <input
                id="pay-purpose"
                type="text"
                placeholder="Booking deposit"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-amount">Amount</label>
              <input
                id="pay-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-due">Due</label>
              <input
                id="pay-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-kind">Deposit type</label>
              <select
                id="pay-kind"
                value={depositKind}
                onChange={(e) => setDepositKind(e.target.value)}
              >
                <option value="none">Not a deposit</option>
                <option value="booking">Booking deposit</option>
                <option value="confirming">Confirming deposit</option>
                <option value="balance">Balance</option>
              </select>
            </div>
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy || !purpose.trim() || !amount}
              onClick={() =>
                send({
                  action: 'request',
                  requestId,
                  purpose,
                  amount: Number(amount),
                  dueOn: dueOn || null,
                  depositKind,
                })
              }
            >
              {busy ? 'Saving...' : 'Add payment'}
            </button>
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            Add a payment
          </button>
        </div>
      )}
    </div>
  );
}
