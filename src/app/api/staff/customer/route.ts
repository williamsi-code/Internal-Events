import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Customers and their contacts.
 *
 * Linking existing events is the important part: eighteen months of
 * history becomes a customer base only if the old events can be
 * attached to the right name.
 */

const Save = z.object({
  action: z.literal('save'),
  id: z.string().uuid().nullable(),
  kind: z.enum([
    'department', 'student_org', 'affiliated',
    'business', 'individual', 'nonprofit',
  ]),
  name: z.string().min(1).max(200),
  tradingName: z.string().max(200).nullable(),
  billingAddress: z.string().max(1000).nullable(),
  billingEmail: z.string().max(200).nullable(),
  billingAccount: z.string().max(100).nullable(),
  taxExempt: z.boolean(),
  taxExemptRef: z.string().max(100).nullable(),
  notes: z.string().max(4000).nullable(),
  dietaryNotes: z.string().max(2000).nullable(),
  accessNotes: z.string().max(2000).nullable(),
  isActive: z.boolean(),
});

const SaveContact = z.object({
  action: z.literal('contact'),
  id: z.string().uuid().nullable(),
  customerId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  role: z.string().max(120).nullable(),
  email: z.string().max(200).nullable(),
  phone: z.string().max(50).nullable(),
  isPrimary: z.boolean(),
  notes: z.string().max(1000).nullable(),
});

const RemoveContact = z.object({
  action: z.literal('removeContact'),
  id: z.string().uuid(),
});

/** Attach every past event that signed the same way. */
const LinkEvents = z.object({
  action: z.literal('link'),
  customerId: z.string().uuid(),
  departmentOrg: z.string().max(200),
  contactEmail: z.string().max(200),
});

const LinkOne = z.object({
  action: z.literal('linkOne'),
  customerId: z.string().uuid().nullable(),
  requestId: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [
  Save, SaveContact, RemoveContact, LinkEvents, LinkOne,
]);

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
    if (b.action === 'save') {
      if (b.id) {
        await query(
          `UPDATE customers
              SET kind = $2::customer_kind, name = $3, trading_name = $4,
                  billing_address = $5, billing_email = $6,
                  billing_account = $7, tax_exempt = $8, tax_exempt_ref = $9,
                  notes = $10, dietary_notes = $11, access_notes = $12,
                  is_active = $13, updated_at = now()
            WHERE id = $1`,
          [
            b.id, b.kind, b.name, b.tradingName, b.billingAddress,
            b.billingEmail, b.billingAccount, b.taxExempt, b.taxExemptRef,
            b.notes, b.dietaryNotes, b.accessNotes, b.isActive,
          ]
        );
        return NextResponse.json({ ok: true, id: b.id });
      }

      const row = await one<{ id: string }>(
        `INSERT INTO customers
           (kind, name, trading_name, billing_address, billing_email,
            billing_account, tax_exempt, tax_exempt_ref,
            notes, dietary_notes, access_notes, is_active, created_by)
         VALUES ($1::customer_kind,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          b.kind, b.name, b.tradingName, b.billingAddress, b.billingEmail,
          b.billingAccount, b.taxExempt, b.taxExemptRef,
          b.notes, b.dietaryNotes, b.accessNotes, b.isActive, user!.id,
        ]
      );
      return NextResponse.json({ ok: true, id: row?.id });
    }

    if (b.action === 'contact') {
      await transaction(async (c) => {
        // Only one primary, enforced by an index, so the old one has
        // to step down before the new one steps up.
        if (b.isPrimary) {
          await c.query(
            `UPDATE customer_contacts SET is_primary = false
              WHERE customer_id = $1 AND ($2::uuid IS NULL OR id <> $2)`,
            [b.customerId, b.id]
          );
        }

        if (b.id) {
          await c.query(
            `UPDATE customer_contacts
                SET full_name = $2, role = $3, email = $4, phone = $5,
                    is_primary = $6, notes = $7
              WHERE id = $1`,
            [b.id, b.fullName, b.role, b.email, b.phone, b.isPrimary, b.notes]
          );
        } else {
          // Match an existing account by email, so their events show
          // in their own list as well as the customer's.
          const existing = b.email
            ? await c.query('SELECT id FROM users WHERE email = $1', [b.email])
            : { rows: [] };

          await c.query(
            `INSERT INTO customer_contacts
               (customer_id, user_id, full_name, role, email, phone,
                is_primary, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              b.customerId, existing.rows[0]?.id ?? null, b.fullName,
              b.role, b.email, b.phone, b.isPrimary, b.notes,
            ]
          );
        }
      });
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'removeContact') {
      await query('DELETE FROM customer_contacts WHERE id = $1', [b.id]);
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'link') {
      const result = await one<{ n: string }>(
        `WITH linked AS (
           UPDATE event_requests
              SET customer_id = $1
            WHERE customer_id IS NULL
              AND department_org = $2
              AND contact_email = $3
            RETURNING id
         )
         SELECT count(*)::text AS n FROM linked`,
        [b.customerId, b.departmentOrg, b.contactEmail]
      );
      return NextResponse.json({ ok: true, linked: Number(result?.n ?? 0) });
    }

    await query('UPDATE event_requests SET customer_id = $2 WHERE id = $1', [
      b.requestId,
      b.customerId,
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('customer save failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
