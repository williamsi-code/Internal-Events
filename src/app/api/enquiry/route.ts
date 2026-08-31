import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Enquiries.
 *
 * Requires an account, because an enquiry is the start of a
 * conversation and there is nowhere to show someone the answer
 * otherwise. Anonymous enquiries end up back in email, which is the
 * thing this replaces.
 */

const Body = z.object({
  phone: z.string().max(50).nullable(),
  organization: z.string().max(200).nullable(),
  eventType: z.string().max(120).nullable(),
  approxDate: z.string().date().nullable(),
  approxGuests: z.number().int().min(0).max(20_000).nullable(),
  message: z.string().min(1).max(4000),
  source: z.string().max(60).nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in so we can reply where you can see it.' },
      { status: 401 }
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Tell us what you would like to know.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  try {
    const enquiry = await transaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO enquiries
           (user_id, name, email, phone, organization, event_type,
            approx_date, approx_guests, message, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, reference_code`,
        [
          user.id, user.full_name, user.email, b.phone, b.organization,
          b.eventType, b.approxDate, b.approxGuests, b.message, b.source,
        ]
      );

      await c.query(
        `INSERT INTO enquiry_messages
           (enquiry_id, author_id, body, is_staff)
         VALUES ($1, $2, $3, false)`,
        [rows[0].id, user.id, b.message]
      );

      return rows[0];
    });

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
          reply_to: user.email,
          subject: `Enquiry ${enquiry.reference_code} from ${user.full_name}`,
          text: `${b.message}\n\n${process.env.AUTH_URL ?? ''}/staff/enquiries\n`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ referenceCode: enquiry.reference_code });
  } catch (err) {
    console.error('enquiry failed:', err);
    return NextResponse.json(
      { error: 'Could not send that. Try calling us on 641.628.5788.' },
      { status: 500 }
    );
  }
}
