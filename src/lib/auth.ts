import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { query, one } from './db';

const COOKIE = 'ce_session';
const TTL_DAYS = 14;

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
}

export async function createSession(userId: string, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TTL_DAYS * 86_400_000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hash(token), userAgent ?? null, expires]
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const user = await one<SessionUser>(
    `SELECT u.id, u.email, u.full_name,
            coalesce(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.is_active
      GROUP BY u.id`,
    [hash(token)]
  );

  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1',
      [hash(token)]
    );
  }
  jar.delete(COOKIE);
}

/** Throws unless the signed-in user holds one of the given roles. */
export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!roles.some(r => user.roles.includes(r))) {
    throw new Response('Forbidden', { status: 403 });
  }
  return user;
}
