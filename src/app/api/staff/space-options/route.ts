import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Setting what a room offers.
 *
 * Replaced wholesale rather than diffed: the form sends the complete
 * set, and a room's capabilities are one thing rather than a list of
 * independent facts.
 */

const Body = z.object({
  spaceId: z.string().uuid(),
  optionIds: z.array(z.string().uuid()).max(60),
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
  const { spaceId, optionIds } = parsed.data;

  try {
    await transaction(async (c) => {
      await c.query('DELETE FROM space_setup_options WHERE space_id = $1', [
        spaceId,
      ]);

      for (const id of optionIds) {
        await c.query(
          `INSERT INTO space_setup_options (space_id, option_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [spaceId, id]
        );
      }
    });
  } catch (err) {
    console.error('space options failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
