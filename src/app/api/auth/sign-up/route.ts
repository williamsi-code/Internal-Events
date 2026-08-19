import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one } from '@/lib/db';
import { createSession } from '@/lib/auth';

const Body = z.object({
  email: z.string().email().max(200),
  fullName: z.string().min(1).max(150),
  departmentOrg: z.string().max(200).optional(),
  // Length beats complexity rules for real-world password strength.
  password: z.string().min(12).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check your details. Passwords must be at least 12 characters.' },
      { status: 400 }
    );
  }
  const { email, fullName, departmentOrg, password } = parsed.data;

  const existing = await one<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing) {
    return NextResponse.json(
      { error: 'An account with that email already exists. Try signing in.' },
      { status: 409 }
    );
  }

  const hash = await bcrypt.hash(password, 12);

  // Affiliation is a starting guess from the email domain. It does NOT
  // drive classification — the matrix showed employees booking weddings,
  // so who someone is says little about what their event is.
  const affiliation = email.toLowerCase().endsWith('@central.edu')
    ? 'faculty_staff'
    : 'external_organization';

  const user = await one<{ id: string }>(
    `INSERT INTO users (email, full_name, department_org, affiliation, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [email, fullName, departmentOrg ?? null, affiliation, hash]
  );

  await one(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'requester')
     ON CONFLICT DO NOTHING RETURNING user_id`,
    [user!.id]
  );

  await createSession(user!.id, req.headers.get('user-agent') ?? undefined);

  return NextResponse.json({ ok: true });
}
