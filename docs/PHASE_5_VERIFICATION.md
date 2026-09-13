# Phase 5 verification

## Completed locally

- Green/lime styling with coral/lilac accents, self-hosted Manrope, responsive Auth
  layout, survey/history cards, larger controls, visible focus, and reduced motion.
- Lint, TypeScript, and production build passed.
- All 13 unit tests and 27 database tests passed.
- Six Auth browser tests passed, including keyboard order and reduced motion.
- Full PostgreSQL/browser workflow passed: required navigation, all question
  formats, receipts/history, retries, points, admin exclusion, builder/approval/push,
  roster, private response flags, and TXT/DOCX/PDF generation into the shared path.
- Twelve screens passed Axe WCAG A/AA checks at 390, 768, and 1440px, plus 320px
  reflow checks: login, signup, dashboard, question, receipt, history, roster,
  survey list, builder, push receipt, response review, and document import.
- Representative Auth, dashboard, builder, and roster screenshots inspected.
  These are browser viewport checks, not physical-device or screen-reader certification.
- The import route's local production manifest records `maxDuration: 120`;
  output tracing includes its extraction worker and PDF parser/worker.
- Vercel documentation confirms Hobby + Fluid Compute permits up to 300 seconds.

## Production status and remaining evidence

The existing `pollpoint` Vercel project serves `https://pollpoint.vercel.app`.
An unauthenticated GET returned HTTP 500. Runtime Logs from the original and a fresh
Production deployment confirm `getSupabaseConfig()` fails validation in the request
proxy. Screenshots confirm the expected variable names and Production scopes, but
masked values cannot establish which value fails. Validation now reports the exact
variable and missing/empty/invalid-URL reason without logging any configuration value.
Commit `4ae7a8f` is now live with HTTP 200 on login/signup and correct signed-out
redirects from `/dashboard` and `/admin`. GitHub CI, Supabase integration, and Vercel
deployment checks passed. The precise configuration correction was not reported;
the diagnostic change itself did not change which values pass validation.
No replacement Vercel project or schema migration was created.

The owner added `NEXT_PUBLIC_SITE_URL` in Vercel Production. The production Auth
initial smoke test found the Supabase confirmation link redirected to `http://localhost:3000`
instead of `https://pollpoint.vercel.app/auth/confirm`, indicating the production
callback is not accepted by the current Auth configuration. The temporary identity
and empty profile were removed; no email, responses, or rewards were created.
After the owner saved the production Auth URLs, `npm run test:hosted -- --production`
passed on 2026-09-13: signup identity/profile provisioning, pre-confirmation login denial,
real production confirmation callback, session cookies, login/logout, protected routes,
profile isolation, direct-write denial, cross-user survey denial, empty history/zero
balance, and participant denial of admin roster/authoring/import RPCs. The temporary
identity and empty profile were removed. No email, hosted responses, or points were created.

Still required before declaring Phase 5 complete:

- Inspect deployed import duration/packaging and verify production import behavior.

The historical admin award remains 100 points; no cleanup was performed.
