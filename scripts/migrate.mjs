import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const dir = join(projectRoot, 'db', 'migrations');

// Read .env.local the way Next.js does, so the migration runner and
// the dev server work from one configuration rather than two.
if (!process.env.DATABASE_URL) {
  try {
    const envFile = await readFile(join(projectRoot, '.env.local'), 'utf8');
    for (const rawLine of envFile.split(/\r?\n/)) {
      // Strip a byte order mark if the file was saved by Notepad.
      const line = rawLine.replace(/^\uFEFF/, '').trim();
      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq < 1) continue;

      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local. Fall through to the error below.
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set, and .env.local did not supply it.');
  console.error(`Looked in: ${join(projectRoot, '.env.local')}`);
  console.error('Use Railway\'s DATABASE_PUBLIC_URL, not DATABASE_URL -');
  console.error('the internal hostname does not resolve outside Railway.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`);

const { rows } = await client.query('SELECT filename FROM schema_migrations');
const applied = new Set(rows.map((r) => r.filename));

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
let ran = 0;

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(join(dir, file), 'utf8');
  process.stdout.write(`  ${file} ... `);
  try {
    // Each migration is one transaction: it applies fully or not at all.
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [file]
    );
    await client.query('COMMIT');
    console.log('ok');
    ran++;
  } catch (err) {
    await client.query('ROLLBACK');
    console.log('failed');
    console.error(`\n${file}: ${err.message}\n`);
    await client.end();
    process.exit(1);
  }
}

console.log(
  ran ? `\nApplied ${ran} migration${ran === 1 ? '' : 's'}.` : '\nNothing to apply.'
);
await client.end();
