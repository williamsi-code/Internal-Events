import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  enquiryId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  isInternal: z.boolean().optional(),
  close: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  }
  const b = parsed.data;

  const isStaff =
    user.roles.includes('events_staff') || user.roles.includes('admin');

  // A requester can only reply to their own enquiry; staff can reply
  // to any. Checked in SQL rather than trusted from the request.
  const enquiry = await one<{ id: string; user_id: string | null }>(
    'SELECT id, user_id FROM enquiries WHERE id = $1',
    [b.enquiryId]
  );
  if (!enquiry) {
    return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  }
  if (!isStaff && enquiry.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your enquiry.' }, { status: 403 });
  }
  if (b.isInternal && !isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  try {
    await query(
      `INSERT INTO enquiry_messages
         (enquiry_id, author_id, body, is_staff, is_internal)
       VALUES ($1, $2, $3, $4, $5)`,
      [b.enquiryId, user.id, b.body, isStaff, b.isInternal ?? false]
    );

    // Reading the thread marks the other side's messages as read, so
    // the unread count reflects attention rather than arrival.
    await query(
      `UPDATE enquiry_messages
          SET read_at = now()
        WHERE enquiry_id = $1
          AND is_staff <> $2
          AND read_at IS NULL`,
      [b.enquiryId, isStaff]
    );

    if (b.close && isStaff) {
      await query(
        `UPDATE enquiries SET status = 'closed', updated_at = now()
          WHERE id = $1`,
        [b.enquiryId]
      );
    }
  } catch (err) {
    console.error('enquiry reply failed:', err);
    return NextResponse.json({ error: 'Could not send that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
