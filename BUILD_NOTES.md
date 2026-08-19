# What is built, and what is not

Honest inventory, so nobody discovers a gap at the wrong moment.

## Working

- **Database schema** — six migrations covering intake, classification,
  authority and escalation, policy exceptions, cost capture and reporting,
  and password authentication. Run in filename order.
- **Migration runner** — `npm run migrate`, transactional per file,
  idempotent, records applied files.
- **Admin seed** — `npm run seed:admin` creates a staff account and prints
  a one-time password.
- **`src/lib/classify.ts`** — the classification rules, shared between the
  browser preview and the server. The server recomputes on submission.
- **`src/lib/db.ts`** — connection pool sized for serverless.
- **`src/lib/auth.ts`** — session creation, lookup, revocation, role guard.
- **`POST /api/requests`** — validates with Zod, writes sections A–D across
  five tables in one transaction, records the advisory classification and
  any deviation, notifies the events inbox.

## Not built

These are the UI layer. The prototypes in `intake-form.html` and
`staff-dashboard.html` are the reference — port them into components.

- `src/app/layout.tsx` and global styles
- `src/app/page.tsx` — public landing page
- `src/app/info/[slug]/` — menu, spaces, policies, classification pages
- `src/app/start/` — the intake form as a React component
- `src/app/staff/` — queue and decision screens
- Sign-in, sign-up, email verification, password reset pages
- Staff API routes for classification, path, capacity, escalation, exceptions
- Requester portal — status view and replying to questions
- Menu selection after classification
- Event close-out — final headcount and actual costs
- Quarterly report screen

## Order to build in

1. **Auth pages.** Nothing else is reachable without sign-in.
2. **Intake form.** Port `intake-form.html`; the API route already exists.
3. **Staff queue.** Port `staff-dashboard.html` against real data.
4. **Requester portal.** Closes the loop the whole design depends on.
5. **Close-out.** Without it, migration 05's reporting views stay empty.

## Known gaps to decide before launch

- **Rate limiting.** `/api/requests` and sign-in have none. Add it before
  the site is public.
- **File uploads.** `attachments` exists in the schema; no storage is
  wired. Vercel Blob or S3.
- **Email verification is not enforced.** Anyone can submit with an
  unverified address. Gate submission on `email_verified_at`.
- **Accessibility.** WCAG 2.1 AA applies. Re-check after every UI change.
- **No tests.** At minimum, cover `classify()` — every row of the matrix
  is a ready-made test case.
