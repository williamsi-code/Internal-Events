import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Granting and removing roles.
 *
 * Admin only. Staff can classify events and edit the menu, but they
 * cannot decide who else gets to - otherwise the access model is
 * whatever the last person felt like.
 */

const Body = z.object({
  userId: z.string().uuid(),
  role: z.enum([
    'requester',
    'events_staff',
    'schedule_viewer',
    'service_approver',
    'admin',
  ]),
  granted: z.boolean(),
});

const Deactivate = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export async function POST(req: NextRequest) {
  const actor = await getSessionUser();
  if (!actor?.roles.includes('admin')) {
    return NextResponse.json(
      { error: 'Only an administrator can change access.' },
      { status: 403 }
    );
  }

  const payload = await req.json();

  const deact = Deactivate.safeParse(payload);
  if (deact.success && !('role' in payload)) {
    if (deact.data.userId === actor.id) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account.' },
        { status: 400 }
      );
    }
    await one(
      `UPDATE users SET is_active = $2, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [deact.data.userId, deact.data.isActive]
    );
    return NextResponse.json({ ok: true });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const { userId, role, granted } = parsed.data;

  // Removing your own admin role locks you out of this screen, and if
  // you are the last administrator it locks everyone out permanently.
  if (userId === actor.id && role === 'admin' && !granted) {
    return NextResponse.json(
      { error: 'You cannot remove your own administrator access.' },
      { status: 400 }
    );
  }

  if (role === 'admin' && !granted) {
    const remaining = await one<{ n: string }>(
      `SELECT count(*) AS n FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
       WHERE ur.role = 'admin' AND u.is_active AND ur.user_id <> $1`,
      [userId]
    );
    if (Number(remaining?.n ?? 0) === 0) {
      return NextResponse.json(
        { error: 'That is the last administrator. Grant it to someone else first.' },
        { status: 400 }
      );
    }
  }

  // Everyone keeps requester, so a former staff member can still see
  // the events they personally requested.
  if (role === 'requester' && !granted) {
    return NextResponse.json(
      { error: 'Every account keeps requester access.' },
      { status: 400 }
    );
  }

  try {
    await transaction(async (c) => {
      if (granted) {
        await c.query(
          `INSERT INTO user_roles (user_id, role, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [userId, role, actor.id]
        );
      } else {
        await c.query(
          'DELETE FROM user_roles WHERE user_id = $1 AND role = $2',
          [userId, role]
        );
      }

      await c.query(
        `INSERT INTO role_changes (user_id, role, granted, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [userId, role, granted, actor.id]
      );
    });
  } catch (err) {
    console.error('role change failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
