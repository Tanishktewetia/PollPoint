# PollPoint

Survey and rewards app built with Next.js 16 App Router, React 19, TypeScript,
Tailwind CSS 4, and Supabase Auth/Postgres. Deployable directly to Vercel.

## Current phase

Phase 1 provides email/password signup, email confirmation, login/logout, protected
dashboard/admin shells, and database migrations with RLS. Survey participation,
history/balance, and admin survey management are subsequent approved phases.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for the approved model and phase gates.
See [Phase 1 verification](./docs/PHASE_1_VERIFICATION.md) for completed checks and
the remaining launch items.

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

The hosted smoke test is opt-in (`npm run test:hosted`): it creates one temporary
Auth identity via Admin-generated confirmation link, checks the real confirmation,
login/logout and non-admin rejection flows, then removes only that identity and
its empty profile. It sends no email and never changes a real user's credentials.

## Phase 1 security boundaries

- Protected pages verify the Auth user; database RLS still enforces ownership.
- SQL admin RPCs verify membership independently of Next.js route guards.
- Users and admins have no direct write grants for surveys, responses, assignments,
  or points. Later phases add narrowly validated transactional RPCs.
- Question-check rules and response flags live in a non-exposed private schema.
- Published definitions and accepted history are immutable. Awards are unique per
  submission and must match its stored reward.
- Private pages use session cookies and `private, no-store` responses. Auth callback
  destinations are restricted to local app routes.
- No application secrets are sent to the browser, logged, or committed.

Vercel deployment and final launch documentation are reserved for Phase 5.
