import { Pool } from 'pg';

// Vercel runs each function in its own isolate, so a module-level pool is
// per-instance rather than global. Keep the ceiling low: many small pools
// exhaust Postgres connections faster than one large one.
const globalForPool = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPool.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: process.env.DATABASE_URL?.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== 'production') globalForPool.pool = pool;

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const res = await pool.query(text, params as never);
  return res.rows as T[];
}

export async function one<T = unknown>(text: string, params?: unknown[]) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction, rolling back on any thrown error. */
export async function transaction<T>(fn: (c: import('pg').PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
