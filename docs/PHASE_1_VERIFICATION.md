# Phase 1 verification — 2026-09-13

## Delivered

- Next.js 16 / React 19 / Tailwind 4 scaffold with TypeScript and Vercel-compatible
  application routing; no separate backend.
- Email/password signup, confirmation callback (PKCE or token hash), login and
  logout; session refresh; protected dashboard and separately protected admin shell.
- Two committed SQL migrations: 12 tables across public/private schemas, RLS and
  explicit grants, automatic profile creation/backfill, membership-based admin
  guards, a restricted first-admin bootstrap, immutable definitions/history,
  and ledger ownership/amount/uniqueness constraints.
- Database types generated from the migrated PostgreSQL catalog, local security
  tests, browser tests, hosted smoke checks, and GitHub Actions quality checks.
- Owner-confirmed admin account provisioned successfully. No account passwords were
  requested, reset, or stored by the implementation.

Survey taking and awarding RPCs belong to Phase 2; history/balance UI to Phase 3;
survey authoring/push/response review to Phase 4. The Phase 1 UI intentionally
contains protected shells, with no fabricated surveys, balances, or responses.

## Local verification

- `npm run lint`: passed.
- `npm run typecheck`: passed, including Next.js route type generation.
- `npm run build`: passed; authenticated pages are dynamic.
- `npm test`: 2 unit tests and 11 database tests passed.
- `npm run db:types`: clean migration replay and catalog generation passed.
- `npm run test:e2e`: 4 browser tests passed in Microsoft Edge.
- Desktop/mobile login screenshots inspected; no horizontal overflow at 390, 768,
  or 1440 pixels. Full styling/accessibility/device QA remains Phase 5.
- Service-role key scan of browser output passed. `.env` is ignored and untracked;
  staged source was checked for the actual service-role key before committing.

Database tests use PGlite (real PostgreSQL compiled to WASM), with only Supabase's
external Auth identity/roles shimmed. They test anonymous denial, cross-user reads,
direct mutation denial, forged role metadata, private-data isolation, admin guards,
first-admin bootstrap restrictions, immutable history, and duplicate/mismatched
awards. Full submission atomicity is tested when its RPC is added in Phase 2.

## Hosted verification

The migrations were pushed in `faa96ea` through the existing `main` integration.
GitHub's Supabase check succeeded. Actual hosted checks additionally verified:

- Supabase Auth is available; email provider and confirmations are enabled.
- Anonymous table reads and the admin RPC are denied with permission errors.
- A temporary signup identity automatically receives its profile.
- Supabase accepts the local `/auth/confirm` redirect URL.
- An unconfirmed account cannot sign in; confirmation establishes working session
  cookies and opens the protected dashboard.
- Login/logout and protection after logout work against the real Auth service.
- The test user can read only its profile, cannot directly edit profiles, and is
  rejected by both the admin route and admin RPC.
- Temporary test identities and their empty profiles were removed after testing.

The smoke checks generate confirmation links through the admin API without sending
email. Inbox delivery/SMTP was not tested and remains a launch configuration item.
The real admin's interactive sign-in was not impersonated; provisioning succeeded,
and authorized admin behavior is covered by database tests.

## Review gate

Phase 2 must not begin until the owner approves Phase 1. Vercel deployment is still
reserved for Phase 5. Run `npm run dev` to review locally, or `npm run build` then
`npm start` for a production-mode local preview.
