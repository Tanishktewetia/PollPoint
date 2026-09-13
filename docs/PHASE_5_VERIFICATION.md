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
The next deployment's runtime error will distinguish these cases.
No replacement Vercel project or schema migration was created.

The four reported Vercel keys omit an additional production Auth requirement:
`NEXT_PUBLIC_SITE_URL=https://pollpoint.vercel.app`. This is a confirmed requirement
of `getSiteUrl()`, not a diagnosis of the root-page 500. Set it for Production and
redeploy. Supabase Site URL and exact callback allowlist are documented in README.

Still required before declaring Phase 5 complete:

- Diagnose/fix the actual production error and verify the resulting deployment.
- Confirm Vercel environment changes and Supabase Auth URLs are applied.
- Verify production confirmation/login/logout without sending email or earning points.
- Inspect deployed import duration/packaging and verify production import behavior.
- Styling commit `615173c` passed GitHub CI, Supabase integration, and Vercel build;
  runtime HTTP 500 persisted. Verify those checks again for the diagnostic update.

The historical admin award remains 100 points; no cleanup was performed.
