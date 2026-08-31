import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Recording payments.
 *
 * Staff only, because no payment happens through this system yet -
 * money arrives as a cheque, a transfer, or a journal entry, and
 * someone records that it did. When a processor is connected, the
 * 'paid' transition will also be reachable from a webhook.
 */

const Request_ = z.object({
  action: z.literal('request'),
  requestId: z.string().uuid(),
  purpose: z.string().min(1).max(200),
  amount: z.number().positive().max(1_000_000),
  dueOn: z.string().date().nullable(),
  depositKind: z.enum(['booking', 'confirming', 'balance', 'none']),
});

const Record_ = z.object({
  action: z.literal('record'),
  paymentId: z.string().uuid(),
  externalRef: z.string().max(120).nullable(),
  methodNote: z.string().max(300).nullable(),
  paidOn: z.string().date().nullable(),
});

const Waive = z.object({
  action: z.literal('waive'),
  paymentId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

const Cancel = z.object({
  action: z.literal('cancel'),
  paymentId: z.string().uuid(),
  reason: z.string().max(500).nullable(),
});

const Body = z.discriminatedUnion('action', [Request_, Record_, Waive, Cancel]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const b = parsed.data;

  try {
    if (b.action === 'request') {
      await transaction(async (c) => {
        let depositId: string | null = null;

        if (b.depositKind !== 'none') {
          const { rows } = await c.query(
            `INSERT INTO event_deposits
               (request_id, kind, amount_due, due_on, recorded_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [b.requestId, b.depositKind, b.amount, b.dueOn, user!.id]
          );
          depositId = rows[0].id;
        }

        const { rows: pay } = await c.query(
          `INSERT INTO payments
             (request_id, deposit_id, purpose, amount, due_on, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id`,
          [b.requestId, depositId, b.purpose, b.amount, b.dueOn, user!.id]
        );

        await c.query(
          `INSERT INTO payment_events (payment_id, to_status, note, actor_id)
           VALUES ($1, 'requested', $2, $3)`,
          [pay[0].id, b.purpose, user!.id]
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'record') {
      await transaction(async (c) => {
        const { rows } = await c.query(
          'SELECT status FROM payments WHERE id = $1',
          [b.paymentId]
        );
        await c.query(
          `UPDATE payments
              SET status = 'paid',
                  paid_at = coalesce($2::date, CURRENT_DATE),
                  external_ref = $3,
                  method_note = $4,
                  recorded_by = $5,
                  updated_at = now()
            WHERE id = $1`,
          [b.paymentId, b.paidOn, b.externalRef, b.methodNote, user!.id]
        );
        await c.query(
          `INSERT INTO payment_events
             (payment_id, from_status, to_status, note, actor_id)
           VALUES ($1, $2, 'paid', $3, $4)`,
          [b.paymentId, rows[0]?.status ?? null, b.methodNote, user!.id]
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'waive') {
      await transaction(async (c) => {
        const { rows } = await c.query(
          'SELECT status FROM payments WHERE id = $1',
          [b.paymentId]
        );
        await c.query(
          `UPDATE payments
              SET status = 'waived', waived_reason = $2,
                  recorded_by = $3, updated_at = now()
            WHERE id = $1`,
          [b.paymentId, b.reason, user!.id]
        );
        await c.query(
          `INSERT INTO payment_events
             (payment_id, from_status, to_status, note, actor_id)
           VALUES ($1, $2, 'waived', $3, $4)`,
          [b.paymentId, rows[0]?.status ?? null, b.reason, user!.id]
        );
      });
      return NextResponse.json({ ok: true });
    }

    await transaction(async (c) => {
      const { rows } = await c.query(
        'SELECT status FROM payments WHERE id = $1',
        [b.paymentId]
      );
      await c.query(
        `UPDATE payments SET status = 'cancelled', updated_at = now()
          WHERE id = $1`,
        [b.paymentId]
      );
      await c.query(
        `INSERT INTO payment_events
           (payment_id, from_status, to_status, note, actor_id)
         VALUES ($1, $2, 'cancelled', $3, $4)`,
        [b.paymentId, rows[0]?.status ?? null, b.reason, user!.id]
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('payment action failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
