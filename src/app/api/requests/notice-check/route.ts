import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkNotice } from '@/lib/notice';
import { getSessionUser } from '@/lib/auth';

/**
 * Does this date and room need approval?
 *
 * Called from the intake form as the requester picks a room and date,
 * so they find out before filling in three more sections.
 */

const Body = z.object({
  spaceId: z.string().uuid(),
  date: z.string().date(),
  time: z.string().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    // Not an error worth showing: an incomplete form simply has
    // nothing to check yet.
    return NextResponse.json({ isShort: false });
  }

  const { spaceId, date, time } = parsed.data;
  const result = await checkNotice(spaceId, date, time);

  if (!result) return NextResponse.json({ isShort: false });

  return NextResponse.json({
    isShort: result.is_short,
    hoursNotice: Number(result.hours_notice),
    requiredHours: result.required_hours,
    spaceName: result.space_name,
  });
}
