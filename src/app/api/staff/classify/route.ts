import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const Body = z.object({
  requestId: z.string().uuid(),
  classification: z.enum([
    'internal',
    'affiliated',
    'external',
    'needs_management_review',
  ]),
  rationale: z.string().min(1).max(4000),
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
    return NextResponse.json(
      { error: 'Choose a classification and give a rationale.' },
      { status: 400 }
    );
  }
  const { requestId, classification, rationale } = parsed.data;

  await transaction(async (c) => {
    // Supersede rather than overwrite. Someone will eventually need to
    // show what was decided, by whom, and when - including the decision
    // that was later changed.
    const { rows: prior } = await c.query(
      `UPDATE classification_decisions
          SET is_current = false
        WHERE request_id = $1 AND is_current
        RETURNING id`,
      [requestId]
    );

    await c.query(
      `INSERT INTO classification_decisions
         (request_id, classification, rationale, decided_by, supersedes_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, classification, rationale, user!.id, prior[0]?.id ?? null]
    );

    const { rows: before } = await c.query(
      `SELECT status FROM event_requests WHERE id = $1`,
      [requestId]
    );

    await c.query(
      `UPDATE event_requests SET status = 'classified', updated_at = now()
        WHERE id = $1`,
      [requestId]
    );

    await c.query(
      `INSERT INTO request_status_history
         (request_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'classified', $3, $4)`,
      [requestId, before[0]?.status ?? null, user!.id, 'Classification recorded']
    );
  });

  return NextResponse.json({ ok: true });
}