# Phase 2 verification — 2026-09-13

## Delivered

- Paginated dashboard of the caller's published, assigned, unfinished surveys.
- Three-step survey flow: mandatory demographics, body questions, and review.
  Back/edit preserve in-page answers; errors identify invalid questions; failed
  requests preserve answers for retry. Unsubmitted drafts are not persisted.
- Integer age with explicit decline, country dropdown (249 ISO codes), income
  and marital-status choices, visible single/multiple choices, short and long text.
- Strict server/database answer validation and publication validation. Unknown
  questions, options, extra fields, duplicate answers/selections, invalid bounds,
  missing required answers, and oversized submissions are rejected.
- One transaction stores responses, private attention-check flags, and the fixed
  points award. Unique constraints and row locks prevent duplicate credits.
- Stored completion receipt with redirect protection against repeat completion.
- A migration-installed 11-question, 100-point example assigned to existing admins
  only. No general survey authoring or distribution UI is introduced in this phase.

## Verification

- Lint, TypeScript route/type checks, and production build passed.
- Six unit tests cover auth and survey input validation.
- Nineteen PGlite database tests cover RLS, ownership, immutable data, publication,
  invalid submissions, rollback on injected ledger failure, full rewards for failed
  attention checks, correct checks, retries, and archived-survey behavior.
- An independent PostgreSQL 17 test sends six requests over separate connections:
  all return one receipt and create one award. An archival lock race rejects the
  waiting unfinished submission without additional history or credit.
- A browser integration test uses the real production Next.js app, real PostgreSQL,
  and a test-only HTTP adapter for Supabase Auth/RPC transport. It checks required
  fields, all formats, exclusive selections, review/back, retained answers after a
  simulated 503, successful retry, the receipt, removal from available surveys,
  repeat-completion redirects, and denial of another user's assignment.
- Desktop demographics and mobile question/receipt screenshots were inspected;
  the mobile flow has no horizontal overflow. The final styling/QA pass remains
  Phase 5.
- All four existing auth/browser regression tests passed against the updated app.

The browser adapter is only in the test directory; it is not an app endpoint and
does not bypass production authentication. All reward-producing tests run locally,
so no hosted account receives test responses or credits. Hosted smoke checks
verify Auth and reject unassigned survey reads/submissions without writing rewards.

## Deployment checkpoint

The new migration files are `20260913000300_survey_engine.sql` and
`20260913000400_example_survey.sql`. They deploy through the existing GitHub-to-
Supabase integration on `main` in commit `3906922`. Both the Supabase deployment
check and GitHub CI completed successfully. Previously applied migrations remain
unchanged.

Hosted checks confirmed the new RPCs, denied anonymous submissions, and verified
that a new signup cannot read or submit the existing admin example assignment.
The full Auth smoke check also passed. The temporary Auth identity and its empty
profile were removed; no hosted survey responses or rewards were created by tests.
The example is ready on the existing admin account's dashboard.

Phase 3 (history and balance) requires a separate approval.
