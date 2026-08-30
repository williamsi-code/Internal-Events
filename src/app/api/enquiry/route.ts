import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one } from '@/lib/db';

/**
 * General enquiries.
 *
 * Open, and deliberately short. Someone who does not yet know what
 * they want should not be asked to classify their event; the whole
 * point of this route is that it costs almost nothing to use.
 */

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(50).nullable(),
  organization: z.string().max(200).nullable(),
  eventType: z.string().max(120).nullable(),
  approxDate: z.string().date().nullable(),
  approxGuests: z.number().int().min(0).max(20_000).nullable(),
  message: z.string().min(1).max(4000),
  source: z.string().max(60).nullable(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please give us your name, an email, and a message.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  try {
    await one(
      `INSERT INTO enquiries
         (name, email, phone, organization, event_type,
          approx_date, approx_guests, message, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        b.name, b.email, b.phone, b.organization, b.eventType,
        b.approxDate, b.approxGuests, b.message, b.source,
      ]
    );
  } catch (err) {
    console.error('enquiry failed:', err);
    return NextResponse.json(
      { error: 'Could not send that. Try emailing us directly.' },
      { status: 500 }
    );
  }

  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Central Catering <noreply@central.edu>',
        to: process.env.EVENTS_INBOX,
        reply_to: b.email,
        subject: `Enquiry from ${b.name}`,
        text: `${b.message}\n\n---\n${b.name}\n${b.email}\n${b.phone ?? ''}\n${b.organization ?? ''}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
