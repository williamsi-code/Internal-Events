import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query } from '@/lib/db';
import { createSession } from '@/lib/auth';

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().max(200),
});

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await one<{
    id: string;
    password_hash: string | null;
    locked_until: Date | null;
    failed_sign_ins: number;
    is_active: boolean;
  }>(
    `SELECT id, password_hash, locked_until, failed_sign_ins, is_active
       FROM users WHERE email = $1`,
    [email]
  );

  // One message for every failure mode. Distinguishing "no such account"
  // from "wrong password" tells an attacker which emails are registered.
  const generic = NextResponse.json(
    { error: 'Email or password is incorrect.' },
    { status: 401 }
  );

  if (!user || !user.password_hash || !user.is_active) {
    // Spend comparable time so timing does not leak account existence.
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return generic;
  }

  if (user.locked_until && user.locked_until > new Date()) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` },
      { status: 429 }
    );
  }

  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok) {
    const attempts = user.failed_sign_ins + 1;
    await query(
      `UPDATE users
          SET failed_sign_ins = $2,
              locked_until = CASE WHEN $2 >= $3
                                  THEN now() + ($4 || ' minutes')::interval
                                  ELSE locked_until END
        WHERE id = $1`,
      [user.id, attempts, MAX_ATTEMPTS, String(LOCK_MINUTES)]
    );
    return generic;
  }

  await query(
    `UPDATE users
        SET failed_sign_ins = 0, locked_until = NULL, last_sign_in_at = now()
      WHERE id = $1`,
    [user.id]
  );

  await createSession(user.id, req.headers.get('user-agent') ?? undefined);

  return NextResponse.json({ ok: true });
}
