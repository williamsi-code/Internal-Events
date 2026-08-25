import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  finalAttendance: z.number().int().positive().max(20_000),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter a guest count of at least one.' },
      { status: 400 }
    );
  }
  const { requestId, finalAttendance } = parsed.data;

  const owned = await one<{
    status: string;
    estimated_attendance: number;
    event_date: string;
  }>(
    `SELECT status, estimated_attendance,
            to_char(event_date, 'YYYY-MM-DD') AS event_date
       FROM event_requests
      WHERE id = $1 AND requester_id = $2`,
    [requestId, user.id]
  );

  if (!owned) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  await transaction(async (c) => {
    await c.query(
      `UPDATE event_requests
          SET final_attendance = $2,
              headcount_submitted_at = now(),
              headcount_submitted_by = $3,
              updated_at = now()
        WHERE id = $1`,
      [requestId, finalAttendance, user.id]
    );

    // A large swing from the estimate is worth putting in front of
    // staff rather than leaving them to notice it on the sheet. The
    // kitchen may have ordered against the old number.
    const before = owned.estimated_attendance;
    const ratio = before > 0 ? finalAttendance / before : 1;
    if (ratio >= 1.25 || ratio <= 0.75) {
      await c.query(
        `INSERT INTO request_messages
           (request_id, author_id, body, is_internal, requires_reply)
         VALUES ($1, $2, $3, true, false)`,
        [
          requestId,
          user.id,
          `Final headcount ${finalAttendance} differs substantially from the estimate of ${before}. Check quantities and staffing.`,
        ]
      );
    }
  });

  return NextResponse.json({ ok: true });
}
