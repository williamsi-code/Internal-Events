import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Review = z.object({
  action: z.literal('review'),
  catererId: z.string().uuid(),
  status: z.enum(['approved', 'declined', 'suspended', 'pending']),
  note: z.string().max(2000).nullable(),
});

const Edit = z.object({
  action: z.literal('edit'),
  catererId: z.string().uuid(),
  licenseNumber: z.string().max(80).nullable(),
  licenseExpiresOn: z.string().date().nullable(),
  insuranceCarrier: z.string().max(160).nullable(),
  insuranceExpiresOn: z.string().date().nullable(),
  servsafeCertified: z.boolean(),
  healthInspectionOn: z.string().date().nullable(),
  cuisineNotes: z.string().max(2000).nullable(),
});

const Body = z.discriminatedUnion('action', [Review, Edit]);

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
    if (b.action === 'edit') {
      await one(
        `UPDATE caterers
            SET license_number=$2, license_expires_on=$3,
                insurance_carrier=$4, insurance_expires_on=$5,
                servsafe_certified=$6, health_inspection_on=$7,
                cuisine_notes=$8, updated_at=now()
          WHERE id=$1 RETURNING id`,
        [
          b.catererId, b.licenseNumber, b.licenseExpiresOn,
          b.insuranceCarrier, b.insuranceExpiresOn, b.servsafeCertified,
          b.healthInspectionOn, b.cuisineNotes,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    await transaction(async (c) => {
      const { rows } = await c.query(
        'SELECT status FROM caterers WHERE id = $1',
        [b.catererId]
      );

      await c.query(
        `UPDATE caterers
            SET status = $2::caterer_status, status_note = $3,
                reviewed_by = $4, reviewed_at = now(), updated_at = now()
          WHERE id = $1`,
        [b.catererId, b.status, b.note, user!.id]
      );

      await c.query(
        `INSERT INTO caterer_status_changes
           (caterer_id, from_status, to_status, note, changed_by)
         VALUES ($1, $2::caterer_status, $3::caterer_status, $4, $5)`,
        [b.catererId, rows[0]?.status ?? null, b.status, b.note, user!.id]
      );
    });
  } catch (err) {
    console.error('caterer review failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
