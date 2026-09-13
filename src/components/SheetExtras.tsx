'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LINE_KINDS, type SheetLine } from '@/lib/sheet-line-kinds';

/**
 * Manual lines and kitchen notes.
 *
 * Sits on the catering sheet with no-print controls, because that is
 * where staff are when they notice something is missing. Everything
 * added here counts as money and reaches the reports, which is the
 * point: writing it on the printout never did.
 */

const money = (v: string | number) =>
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SheetExtras({
  requestId,
  lines,
  notes,
}: {
  requestId: string;
  lines: SheetLine[];
  notes: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteText, setNoteText] = useState(notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    kind: 'other' as (typeof LINE_KINDS)[number][0],
    description: '',
    quantity: '1',
    unitPrice: '',
    unitLabel: '',
    isCharged: true,
  });

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return false;
      }
      router.refresh();
      setBusy(false);
      return true;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
      return false;
    }
  }

  async function add() {
    if (!f.description.trim()) {
      setError('Describe what the line is for.');
      return;
    }
    const ok = await send({
      action: 'addLine',
      requestId,
      kind: f.kind,
      description: f.description.trim(),
      quantity: Number(f.quantity) || 1,
      unitPrice: Number(f.unitPrice) || 0,
      unitLabel: f.unitLabel.trim() || null,
      isCharged: f.isCharged,
    });
    if (ok) {
      setF({ ...f, description: '', quantity: '1', unitPrice: '', unitLabel: '' });
      setOpen(false);
    }
  }

  return (
    <div className="sheet-extras no-print">
      <div className="extras-head">
        <h3>Add to this sheet</h3>
        <p className="sub">
          Anything not on the menu: market-value items, rentals, delivery,
          agreed discounts. These count toward the total and reach the reports.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {lines.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Line</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="admin-name">{l.description}</span>
                  <span className="admin-sub">
                    {LINE_KINDS.find(([k]) => k === l.kind)?.[1] ?? l.kind}
                    {l.created_by_name ? ` \u00b7 ${l.created_by_name}` : ''}
                  </span>
                  {!l.is_charged && (
                    <span className="pill p-review">Not charged</span>
                  )}
                </td>
                <td className="num">
                  {Number(l.quantity)}
                  {l.unit_label ? ` ${l.unit_label}` : ''}
                </td>
                <td className="num">{money(l.unit_price)}</td>
                <td className="num strong">
                  {l.is_charged ? money(l.line_total) : '\u2014'}
                </td>
                <td className="num">
                  <button
                    className="edit-link"
                    disabled={busy}
                    onClick={() => send({ action: 'removeLine', id: l.id })}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <div className="extras-form">
          <div className="grid two">
            <div className="field">
              <label htmlFor="ex-desc">What is it?</label>
              <input
                id="ex-desc"
                type="text"
                placeholder="Carved prime rib, market price"
                value={f.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ex-kind">Kind</label>
              <select
                id="ex-kind"
                value={f.kind}
                onChange={(e) => set({ kind: e.target.value as typeof f.kind })}
              >
                {LINE_KINDS.map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid two">
            <div className="field">
              <label htmlFor="ex-qty">Quantity</label>
              <input
                id="ex-qty"
                type="number"
                step="0.5"
                value={f.quantity}
                onChange={(e) => set({ quantity: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ex-unit">Unit</label>
              <p className="sub">Optional. Per person, per hour, per tray.</p>
              <input
                id="ex-unit"
                type="text"
                value={f.unitLabel}
                onChange={(e) => set({ unitLabel: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ex-price">Price each</label>
              {f.kind === 'discount' && (
                <p className="sub">
                  Enter it as a positive number; it will be taken off.
                </p>
              )}
              <input
                id="ex-price"
                type="number"
                step="0.01"
                value={f.unitPrice}
                onChange={(e) => set({ unitPrice: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="chk-inline" style={{ marginTop: '1.7rem' }}>
                <input
                  type="checkbox"
                  checked={f.isCharged}
                  onChange={(e) => set({ isCharged: e.target.checked })}
                />
                Charge for this
              </label>
              <p className="sub">
                Untick for something the kitchen needs to know about but the
                customer is not paying for.
              </p>
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={add} disabled={busy}>
              {busy ? 'Adding...' : 'Add the line'}
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setOpen(true)}>
            Add a line
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setEditingNotes((v) => !v)}
          >
            {notes ? 'Edit the notes' : 'Add notes for the kitchen'}
          </button>
        </div>
      )}

      {editingNotes && (
        <div className="extras-form">
          <div className="field">
            <label htmlFor="ex-notes">Notes for the kitchen and service</label>
            <p className="sub">
              Printed on the sheet. The requester does not see these.
            </p>
            <textarea
              id="ex-notes"
              rows={5}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                const ok = await send({
                  action: 'notes',
                  requestId,
                  notes: noteText.trim() || null,
                });
                if (ok) setEditingNotes(false);
              }}
            >
              {busy ? 'Saving...' : 'Save the notes'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setNoteText(notes ?? '');
                setEditingNotes(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
