import { randomBytes } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i === -1 ? null : args[i + 1]; };
const email = get('--email');
const name = get('--name') ?? 'Events Staff';

if (!email) {
  console.error('Usage: npm run seed:admin -- --email you@central.edu --name "Your Name"');
  process.exit(1);
}

const password = randomBytes(9).toString('base64url');
const hash = await bcrypt.hash(password, 12);

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `INSERT INTO users (email, full_name, affiliation, email_verified_at, password_hash)
   VALUES ($1, $2, 'faculty_staff', now(), $3)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
   RETURNING id`,
  [email, name, hash]
);

for (const role of ['events_staff', 'admin']) {
  await client.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [rows[0].id, role]
  );
}

console.log(`\nAccount ready: ${email}`);
console.log(`One-time password: ${password}`);
console.log('Change it after your first sign-in.\n');
await client.end();
