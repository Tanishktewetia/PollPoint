# Phase 4 verification

Implemented one shared survey builder and save/approve/push workflow for manual
and Gemini drafts. Includes all question formats, private attention checks, draft
copying, archival, selected/all participant targeting, response review and flags,
and a paginated read-only roster (display name, current Auth email, ledger total).

Generated surveys start in `needs_review`; edits remain in the same builder.
Approval binds to the exact definition version; edits clear approval. First push
publishes atomically, excludes admins, snapshots recipients and records an
idempotent receipt. Published definitions remain immutable.

Document imports accept TXT, DOCX and text PDF. Upload limits, content signatures,
expanded ZIP limits, PDF page limits, UTF-8 validation, bounded worker execution,
structured Gemini output and full existing-schema/database validation are enforced.
Only metadata and validated surveys persist. Leases, owner checks, rate/concurrency
limits and content-bound request IDs prevent overlapping work and duplicate drafts.
The browser retains only retry metadata across reloads. Gemini uses a server-only
key and the verified `gemini-3.6-flash` default; a real synthetic generation returned
a valid seven-question survey including the four server-added demographics.

Validation passed:

- Production build, TypeScript, lint and clean migration replay/type generation.
- 13 unit tests (including six import/authoring tests) and 27 database tests.
- Independent PostgreSQL sessions: duplicate submission/push, archival, admin
  promotion, stale approval and overlapping import leases.
- Production browser: manual save/edit/approval/push, roster isolation, read-only
  published builder, response flags, and TXT/DOCX/PDF uploads followed by review,
  editing, approval and push through the shared path. This isolated browser run
  mocks only Gemini; the parser, app and PostgreSQL are real. A separate live Gemini
  request verified the provider contract. Mobile roster screenshot inspected.
- Five auth/browser regression checks passed, including anonymous and foreign-origin
  rejection at the document upload endpoint.
- Worker and PDF parser dependencies verified in Next.js deployment file tracing.

Migrations: `20260913000700_admin_authoring.sql` and
`20260913000800_survey_imports.sql`. Previously deployed migrations are unchanged.
All reward-producing verification uses isolated test databases.

Historical award explicitly flagged: the first admin has one preserved 100-point
award from before admin exclusion. The participant-only roster excludes admin
accounts; the award remains in the immutable ledger. No cleanup or reversal was
performed. The owner will decide whether to request a separate cleanup policy.

Phase 5 remains pending. Before Vercel launch, confirm the deployment honors the
import route's 120-second budget and configure Gemini as a server secret. No
separate backend or second question renderer was introduced.
