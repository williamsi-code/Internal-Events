import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one } from '@/lib/db';

/**
 * Caterer applications.
 *
 * Deliberately open: a caterer applying does not have a Central
 * account and should not need one. What they submit is a pending
 * record with no access to anything - staff decide whether it
 * becomes an approved entry.
 */

const Body = z.object({
  businessName: z.string().min(1).max(160),
  contactName: z.string().min(1).max(120),
  contactEmail: z.string().email().max(200),
  contactPhone: z.string().max(50).nullable(),
  website: z.string().max(300).nullable(),
  address: z.string().max(400).nullable(),
  licenseNumber: z.string().max(80).nullable(),
  licenseExpiresOn: z.string().date().nullable(),
  insuranceCarrier: z.string().max(160).nullable(),
  insuranceExpiresOn: z.string().date().nullable(),
  servsafeCertified: z.boolean(),
  healthInspectionOn: z.string().date().nullable(),
  cuisineNotes: z.string().max(2000).nullable(),
  applicantNotes: z.string().max(2000).nullable(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check the required fields and try again.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  const existing = await one<{ id: string; status: string }>(
    'SELECT id, status FROM caterers WHERE business_name = $1',
    [b.businessName]
  );
  if (existing) {
    return NextResponse.json(
      {
        error:
          'There is already an application under that business name. Contact the events office if you need to update it.',
      },
      { status: 409 }
    );
  }

  try {
    await one(
      `INSERT INTO caterers (
         business_name, contact_name, contact_email, contact_phone,
         website, address, license_number, license_expires_on,
         insurance_carrier, insurance_expires_on, servsafe_certified,
         health_inspection_on, cuisine_notes, applicant_notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        b.businessName, b.contactName, b.contactEmail, b.contactPhone,
        b.website, b.address, b.licenseNumber, b.licenseExpiresOn,
        b.insuranceCarrier, b.insuranceExpiresOn, b.servsafeCertified,
        b.healthInspectionOn, b.cuisineNotes, b.applicantNotes,
      ]
    );
  } catch (err) {
    console.error('caterer application failed:', err);
    return NextResponse.json(
      { error: 'Could not submit your application.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
