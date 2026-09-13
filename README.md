# PollPoint

Survey and rewards app built with Next.js 16 App Router, React 19, TypeScript,
Tailwind CSS 4, and Supabase Auth/Postgres. Deployable directly to Vercel.

## Current phase

Phase 2 provides an assigned-survey dashboard, demographic and opinion questions,
dropdowns, visible single/multiple choices, short/long text, review/edit steps,
and atomic submission with point awards. Email/password Auth, protected routes,
and RLS were completed in Phase 1. History/balance and admin survey management
remain in their later approved phases.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for the approved model and phase gates.
See [Phase 1 verification](./docs/PHASE_1_VERIFICATION.md) for completed checks and
the remaining launch items.
See [Phase 2 verification](./docs/PHASE_2_VERIFICATION.md) for the survey engine.

The “Everyday life, your way” example is assigned to existing admins by the Phase 2
migration. Sign in to that account and open the dashboard to try it. It contains
11 questions and awards 100 points on completion, once per user. Demographics can
be declined; income options explicitly use monthly INR. There is no broadcast to
ordinary users or later signups. The example uses the same publication validation
as future authored surveys.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm ci
```

Copy `.env.example` to `.env` only if no `.env` exists. Supply:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: public anon key used by user-scoped clients.
- `SUPABASE_SERVICE_ROLE_KEY`: only needed for local admin bootstrap/operational
  checks; the Next.js application never imports it.
- `NEXT_PUBLIC_SITE_URL`: application origin (`http://localhost:3000` locally).

Apply the committed migrations to the project's database before signing in, then:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Keep `.env` untracked. The unprefixed
anon key is read server-side; a future browser client receives only an explicit
public URL/key DTO, never the entire server environment.

## Supabase migrations and Auth

`supabase/migrations/*.sql` is the source of truth. Never edit an applied migration.
The configured GitHub integration deploys committed migrations pushed to `main`.
Check the integration status and run `npm run db:check` afterwards. Do not run a
second deployment mechanism concurrently with the integration.

For a separate environment without that integration, authenticate Supabase CLI,
link the intended project, and apply the same migration files with `npx supabase
db push`. This requires CLI/database credentials; a service-role API key alone
cannot apply DDL. `supabase/config.toml` also supports local Supabase with Docker.

In the Supabase Auth dashboard:

1. Enable email/password and email confirmations.
2. Set Site URL to the actual app origin and allow `<origin>/auth/confirm` redirects.
3. For confirmation links that work across browsers, set the Confirm signup email
   link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
   Standard PKCE `code` callbacks to `/auth/confirm` are also supported and require
   the browser that initiated signup.
4. Configure production SMTP, redirect URLs, and Auth rate limits before public
   launch. Do not use production data for preview environments.

Profile creation is automatic on signup. Role metadata supplied during signup is
ignored. The first admin must be an owner-confirmed, email-confirmed Auth UUID:

```sh
npm run admin:bootstrap -- <confirmed-user-uuid>
```

This local operation uses the service-role key and a restricted, one-time RPC.
Anonymous and ordinary authenticated users cannot call it. No public bootstrap UI
exists. All later admin actions check database membership, not client claims.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run db:types
npm run build
npm run test:e2e
npm run test:concurrency
npm run test:survey-browser
npm run db:check
```

Database tests replay all migrations into a fresh PGlite PostgreSQL instance,
shim only Supabase Auth roles/identity, and check RLS, admin enforcement, private
data isolation, immutable history, and award constraints. They need no Docker or
hosted secrets. `db:types` generates public types from that migrated catalog.
`db:check` separately verifies hosted Auth and anonymous access denial; missing
migrations fail the check. Browser tests use installed Microsoft Edge; change the
Playwright channel or install Chromium if Edge is unavailable. Build before running
browser tests, or start the development server separately.

`test:concurrency` runs independent PostgreSQL 17 sessions to verify simultaneous
submissions and archival. `test:survey-browser` starts an isolated PostgreSQL
cluster, a test-only Supabase HTTP adapter on port 54329, and the production Next.js
build on port 3001. It exercises the actual UI and SQL RPCs without creating hosted
responses or rewards. Both tests stop their services and remove only their own
temporary `.test-databases` directories. No Docker is needed. Build first; use Edge
locally or install Chromium for CI. Integration tests require ports 3001 and 54329
to be free. Screenshots are kept in ignored `test-results/phase-2/`.

The hosted smoke test is opt-in (`npm run test:hosted`): it creates one temporary
Auth identity via Admin-generated confirmation link, checks the real confirmation,
login/logout and non-admin rejection flows, then removes only that identity and
its empty profile. It sends no email and never changes a real user's credentials.

## Phase 1 security boundaries

- Protected pages verify the Auth user; database RLS still enforces ownership.
- SQL admin RPCs verify membership independently of Next.js route guards.
- Users and admins have no direct write grants for surveys, responses, assignments,
  or points. `submit_survey` validates ownership, answers, and stored rewards in one
  transaction. Retries return the original receipt without another credit.
- Question-check rules and response flags live in a non-exposed private schema.
  Failed attention checks never reduce or block the fixed reward.
- Published definitions and accepted history are immutable. Awards are unique per
  submission and must match its stored reward.
- Private pages use session cookies and `private, no-store` responses. Auth callback
  destinations are restricted to local app routes.
- No application secrets are sent to the browser, logged, or committed.

Vercel deployment and final launch documentation are reserved for Phase 5.


## Participant history and eligibility

Admins land in `/admin` and cannot take surveys or earn new points. Historic
records are retained. Participant navigation requires a valid answer before Next;
optional questions can be skipped. `/history` shows paginated stored receipts and
the ledger-backed points balance, including archived completions. All totals are
transported as decimal strings and formatted without precision loss.

Phase 2A and Phase 3 verification is recorded in `docs/`. The Phase 4 admin builder,
roster, and Gemini document import are the next scope, awaiting their phase gate.
