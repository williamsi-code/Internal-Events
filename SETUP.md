# Setup guide

Getting the Central College Events system running on GitHub, Railway, and
Vercel. Allow about ninety minutes for a first run, plus whatever time IT
needs for approvals.

Work through the sections in order. Each one ends with a check — if the
check fails, fix it before moving on, because later steps depend on it.

---

## Before you begin

### Approvals to request now

These take longer than anything technical, so start them first.

**From campus IT:**

1. May institutional data be hosted on Railway and Vercel? Both are US-based
   commercial cloud providers. Ask specifically about the event data you'll
   store: names, campus email addresses, department budget accounts, and
   contact details for outside organizations.
2. Must the application use campus single sign-on? If yes, stop before
   building any of the sign-in screens — the schema already supports SSO,
   and you'd be discarding the work.
3. Who controls DNS for `central.edu` subdomains, and what's the process
   for requesting one?

**From your department:**

Approval for roughly $10–25 per month in hosting, plus the Vercel Pro seat
if IT determines the free tier's non-commercial terms don't fit.

### Software on your machine

| Tool | Check it's installed | If missing |
|---|---|---|
| Node.js 22+ | `node --version` | nodejs.org, or `brew install node` |
| Git | `git --version` | git-scm.com, or `brew install git` |
| GitHub CLI (optional) | `gh --version` | cli.github.com — makes step 2 shorter |

### Accounts

Sign up at github.com, railway.app, and vercel.com. Use your Central email.
For Railway and Vercel, choose "Continue with GitHub" — it saves connecting
them later.

> **A note on ownership.** Create these under a departmental account or
> organization rather than your personal one. If the accounts belong to one
> person, the College loses access when that person leaves. On GitHub,
> create an organization; on Railway and Vercel, invite a second
> administrator once you're set up.

---

## 1. Get the code on your machine

Extract `central-events.tar.gz` somewhere sensible — your Documents folder
is fine — then open a terminal in that folder:

```bash
cd path/to/central-events
npm install
```

This downloads the dependencies. It takes a minute or two and creates a
`node_modules` folder you never need to touch or commit.

**Check:** `ls` shows `package.json`, `src`, `db`, and `scripts`.

---

## 2. GitHub

### With the GitHub CLI

```bash
git init
git add .
git commit -m "Initial scaffold"
gh auth login
gh repo create central-college/events --private --source=. --push
```

### Without it

1. Go to github.com and click **New repository**.
2. Name it `events`. Set it to **Private**. Do not add a README, .gitignore,
   or licence — the project already has them, and adding them here creates a
   conflict.
3. Click **Create repository**, then run:

```bash
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/central-college/events.git
git push -u origin main
```

If GitHub asks for a password, it wants a personal access token instead:
Settings → Developer settings → Personal access tokens → Fine-grained
tokens, with Contents read and write on this repository.

**Why private:** the repository will hold policy language, pricing, and
contact details.

**Check:** refresh the repository page on GitHub and you can see your files.

---

## 3. Railway — the database

1. At railway.app, click **New Project**.
2. Choose **Deploy PostgreSQL**. (Not "Deploy from GitHub" — Railway is only
   hosting your database. Vercel runs the application.)
3. Wait for the service to finish provisioning, perhaps thirty seconds.
4. Click the Postgres service, then the **Variables** tab.
5. Find **`DATABASE_PUBLIC_URL`** and copy it.

> ### Read this bit twice
>
> Railway shows several connection strings. `DATABASE_URL` is the most
> prominent, and it is the wrong one. Its hostname —
> `postgres.railway.internal` — only resolves inside Railway's private
> network. Vercel is outside that network.
>
> You want **`DATABASE_PUBLIC_URL`**, which points at Railway's TCP proxy
> on a host like `turntable.proxy.rlwy.net` with a five-digit port.
>
> Using the internal URL produces a connection timeout that looks like a
> firewall problem, and people lose afternoons to it.

**Check:** the string you copied contains `proxy.rlwy.net` (or similar) and
a port number that is not 5432.

---

## 4. Create the database structure

Still in your project folder:

```bash
export DATABASE_URL="paste-the-public-url-here"
npm run migrate
```

On Windows PowerShell, use `$env:DATABASE_URL="..."` instead of `export`.

You should see each migration applied in turn:

```
  01_core.sql ... ok
  02_event_types.sql ... ok
  03_authority.sql ... ok
  04_exceptions.sql ... ok
  05_reporting.sql ... ok
  06_auth.sql ... ok

Applied 6 migrations.
```

If one fails, the runner stops and rolls that file back — nothing is left
half-applied. Fix the reported error and run it again; already-applied
migrations are skipped.

**Check:** in Railway, open the Postgres service and click **Data**. You
should see tables including `event_requests`, `event_types`, and
`policy_exceptions`. Open `event_types` and confirm it has around 37 rows,
one per line of your classification matrix.

---

## 5. Create your staff account

```bash
npm run seed:admin -- --email you@central.edu --name "Your Name"
```

It prints a one-time password. Copy it somewhere safe for now; change it
after your first sign-in.

**Check:** the command prints an account and a password without errors.

---

## 6. Vercel — the application

1. At vercel.com, click **Add New → Project**.
2. Under Import Git Repository, find `central-college/events` and click
   **Import**. If it isn't listed, click **Adjust GitHub App Permissions**
   and grant access to the repository.
3. Vercel detects Next.js automatically. Leave the build settings alone.
4. **Before deploying, expand "Environment Variables"** and add these.
   Deploying without them fails, which is harmless but wastes a cycle.

| Name | Value |
|---|---|
| `DATABASE_URL` | The Railway public URL from step 3 |
| `AUTH_SECRET` | Run `openssl rand -base64 32` and paste the output |
| `AUTH_URL` | Leave blank for now; you'll fill it in at step 7 |
| `EVENTS_INBOX` | `events@central.edu` |
| `RESEND_API_KEY` | Leave blank until you set up email |

Make sure each variable is ticked for **Production, Preview, and
Development**. Variables set only for Production cause preview deployments
to fail in confusing ways.

5. Click **Deploy** and wait two or three minutes.

**Check:** the build completes and Vercel shows you a URL like
`events-abc123.vercel.app`.

---

## 7. Finish the configuration

1. Copy your Vercel production URL.
2. Go to **Settings → Environment Variables**, edit `AUTH_URL`, and paste it
   in. No trailing slash.
3. Go to **Deployments**, click the most recent one, and choose
   **Redeploy**. Environment variables are read at build time, so a change
   needs a rebuild to take effect.

**Check:** visit your Vercel URL and the site loads.

> The scaffold's backend is complete but the pages are not built yet, so
> what loads at this stage is minimal. `BUILD_NOTES.md` lists exactly what
> remains and the order to build it in. Everything below still applies.

---

## 8. Custom domain

1. In Vercel: **Settings → Domains → Add**, and enter `events.central.edu`.
2. Vercel shows a CNAME record. Send it to whoever controls campus DNS —
   this is usually a ticket, not something you can do yourself.
3. Once DNS propagates, Vercel issues an HTTPS certificate automatically.
   This can take anywhere from minutes to a day.
4. When the domain is live, update `AUTH_URL` to the new address and
   redeploy.

**Check:** `https://events.central.edu` loads with a valid certificate.

---

## 9. How you work from here

**Everyday changes:**

```bash
git add .
git commit -m "Describe what changed"
git push
```

Vercel deploys `main` automatically within a couple of minutes.

**Safer changes** — use a branch, and Vercel builds a preview URL you can
share before anything reaches the live site:

```bash
git checkout -b add-menu-page
# make changes
git add .
git commit -m "Add catering menu page"
git push -u origin add-menu-page
```

Open a pull request on GitHub. The CI workflow type-checks the build and
applies every migration to a clean Postgres, so a broken migration fails
there rather than on Railway.

**Database changes** are deliberately manual. Add a new numbered file in
`db/migrations/`, never edit an applied one, then:

```bash
export DATABASE_URL="the Railway public URL"
npm run migrate
```

Automatic schema changes on deploy are how a bad migration takes down
production on a Friday afternoon.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ETIMEDOUT` or hangs connecting | Using Railway's internal `DATABASE_URL` | Use `DATABASE_PUBLIC_URL` |
| `self signed certificate in certificate chain` | SSL settings | Already handled in `db.ts`; confirm you're on the public URL |
| `too many connections` | Serverless functions each opening one | Add PgBouncer as a second Railway service |
| Build fails, "Environment Variable not found" | Variable missing or set for Production only | Set it for all three environments, then redeploy |
| Env var change had no effect | Read at build time | Redeploy after changing variables |
| `npm run migrate` says nothing to apply | Already applied | Check the `schema_migrations` table |
| GitHub rejects your password | Passwords no longer accepted | Use a personal access token |
| Vercel can't see the repository | GitHub App permissions | Adjust GitHub App Permissions in Vercel |

---

## Running costs

| Service | Expect |
|---|---|
| GitHub | Free for private repositories |
| Railway | ~$5–10/month for Postgres at this volume |
| Vercel | Free tier is technically sufficient, but its terms exclude commercial use — check with IT whether a Pro seat (~$20/month/user) is required |
| Resend | Free up to 3,000 emails/month |

Set a spending limit in Railway (Settings → Usage) so a runaway query can't
produce a surprise bill.

---

## Before this holds real data

- [ ] IT has approved hosting institutional data on these platforms
- [ ] A second administrator has access to all three accounts
- [ ] Railway backups are enabled, and you have restored one as a test
- [ ] A spending limit is set on Railway
- [ ] The seeded admin password has been changed
- [ ] Rate limiting is in place on sign-in and request submission
- [ ] Email verification is required before a request can be submitted
- [ ] The site has been checked against WCAG 2.1 AA
- [ ] Someone other than you knows how to run a migration

That last one matters more than it looks. A system only one person can
operate is a system with a single point of failure, and it's usually
discovered at the worst possible moment.

---

*Platform interfaces change. If a screen doesn't match what's described
here, the underlying steps — create a Postgres database, copy the public
connection string, set environment variables, deploy — are stable even when
the buttons move.*
