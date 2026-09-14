import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionsForSpace } from '@/lib/setup-options';
import { getSessionUser } from '@/lib/auth';

/**
 * What a room can do.
 *
 * Called from the intake form when the requester picks a room, so the
 * checklist reflects that room rather than a generic list.
 */

const Body = z.object({ spaceId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ options: [] });

  const options = await getOptionsForSpace(parsed.data.spaceId);
  return NextResponse.json({ options });
}
