import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Referring a declined event to outside caterers.
 *
 * The referral is a message as much as a record: the requester needs
 * to be told, with contact details, not left to find the approved
 * list on their own.
 */

const Body = z.object({
  requestId: z.string().uuid(),
  catererIds: z.array(z.string().uuid()).max(6),
  catererOther: z.string().max(200).nullable(),
  keepsRoom: z.boolean(),
  message: z.string().max(4000).nullable(),
});

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

  if (b.catererIds.length === 0 && !b.catererOther?.trim()) {
    return NextResponse.json(
      { error: 'Choose at least one caterer to suggest.' },
      { status: 400 }
    );
  }

  try {
    await transaction(async (c) => {
      // Replaced wholesale, so changing the suggestion does not leave
      // the old one showing alongside it.
      await c.query('DELETE FROM caterer_referrals WHERE request_id = $1', [
        b.requestId,
      ]);

      for (const id of b.catererIds) {
        await c.query(
          `INSERT INTO caterer_referrals (request_id, caterer_id, referred_by)
           VALUES ($1, $2, $3)`,
          [b.requestId, id, user!.id]
        );
      }

      if (b.catererOther?.trim()) {
        await c.query(
          `INSERT INTO caterer_referrals
             (request_id, caterer_other, referred_by)
           VALUES ($1, $2, $3)`,
          [b.requestId, b.catererOther.trim(), user!.id]
        );
      }

      await c.query(
        `UPDATE event_requests
            SET keeps_room_after_decline = $2, updated_at = now()
          WHERE id = $1`,
        [b.requestId, b.keepsRoom]
      );

      // Also recorded on the capacity check, so the quarterly report
      // counts it as work sent away rather than work lost.
      await c.query(
        `UPDATE capacity_checks
            SET outside_caterer_referred = true
          WHERE id = (
            SELECT id FROM capacity_checks
             WHERE request_id = $1
             ORDER BY checked_at DESC LIMIT 1
          )`,
        [b.requestId]
      );

      const names = await c.query<{ n: string }>(
        `SELECT coalesce(oc.business_name, cr.caterer_other) AS n
           FROM caterer_referrals cr
           LEFT JOIN outside_caterers oc ON oc.id = cr.caterer_id
          WHERE cr.request_id = $1`,
        [b.requestId]
      );

      const list = names.rows.map((r) => r.n).join(', ');

      await c.query(
        `INSERT INTO request_messages
           (request_id, author_id, body, is_internal, requires_reply)
         VALUES ($1, $2, $3, false, false)`,
        [
          b.requestId,
          user!.id,
          b.message?.trim() ||
            `We are not able to cater this one ourselves, but these caterers are approved to work on campus and may be able to help: ${list}. Their details are on your event page.${
              b.keepsRoom
                ? ' Your room booking still stands, so the event can go ahead as planned.'
                : ''
            }`,
        ]
      );
    });
  } catch (err) {
    console.error('referral failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
