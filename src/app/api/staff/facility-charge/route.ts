import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Setting the facility charge.
 *
 * Suggested by the system, decided by a person. Split-catering events
 * are the reason this is not simply computed: Central is already being
 * paid for its portion, so whether the room is also charged depends on
 * the event.
 */

const Body = z.object({
  requestId: z.string().uuid(),
  amount: z.number().min(0).max(1_000_000),
  note: z.string().max(2000).nullable(),
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
    return NextResponse.json({ error: 'Check the amount.' }, { status: 400 });
  }
  const { requestId, amount, note } = parsed.data;

  try {
    await one(
      `UPDATE event_requests
          SET facility_charge_applied = $2,
              facility_charge_note = $3,
              facility_charge_set_by = $4,
              facility_charge_set_at = now(),
              updated_at = now()
        WHERE id = $1
        RETURNING id`,
      [requestId, amount, note, user!.id]
    );
  } catch (err) {
    console.error('facility charge failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
