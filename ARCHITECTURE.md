# PollPoint Architecture

Status: Architecture revision awaiting approval. Phase 3 is on hold. The confirmed
changes below supersede earlier admin-participation and authoring decisions;
implementation must wait for approval of this revision.

## 1. Product decisions and scope

The owner confirmed the following product decisions on 2026-09-13:

| Decision | Confirmed behavior | Schema consequence |
| --- | --- | --- |
| Push to all | Target registered non-admin users at push time. Later signups require another push. | Materialized per-user assignments; exclude admin memberships from every targeting path. |
| Completion and revisions | One completion and fixed reward per user per survey. Freeze questions and reward on publication; copy to a new survey for revisions. | Unique user/survey submission and assignment; immutable published question definitions and reward. |
| Demographics | Required first section on every completion, with a “Prefer not to say” answer; store per completion. | Demographic questions and answers belong to the survey, not the profile. Income labels specify currency and period. |

Changes to these choices require updating the dependent schema, permissions, and
flows below before implementation proceeds.

Other implementation choices:

- Rewards are nonnegative integer points set by an admin, credited on successful
  submission. Failed attention checks never reduce, delay, or block the reward.
- Points are an earnings ledger. Redemption, cash conversion, transfers, and manual
  adjustments are outside the brief and outside the initial schema.
- Survey states are `needs_review`, `draft`, `published`, and `archived`.
  Imported drafts start in `needs_review`. Manual and generated surveys use the
  same builder, approval action, and push action. Approval records the exact
  definition version; edits invalidate approval. First push atomically publishes
  an approved draft. Published surveys may be pushed again to additional users.
- Archiving removes an unfinished survey from availability. Completed history and
  earnings remain accessible. No survey hard-delete or assignment revocation UI.
- The initial release has no expiry, branching, quotas, partial credit, timed
  surveys, or persisted answer drafts. A failed network submission can be retried.
- Admins cannot take surveys or earn points. Admin sign-in routes to `/admin`;
  user dashboard/survey/history routes redirect admins there. Admin previews are
  read-only and never create assignments, submissions, or credits.
- Admins have a read-only roster of non-admin users, including current email,
  display name, and total earned points. Email comes from Supabase Auth.
- Profile display names are optional. Survey answers are identifiable to authorized
  admins, not anonymous. Explain this before survey submission.
- Demographic option sets must be explicit survey configuration; do not infer a
  user's currency or income period from location. The first example survey can use
  clearly labeled monthly INR brackets, subject to content review in Phase 2.

## 2. Stack and trust boundaries

- Next.js App Router with TypeScript; Node runtime for authenticated server work;
  deploy the application directly to Vercel without a separate backend service.
- Tailwind CSS for a responsive rewards-product UI. Server Components for initial
  reads; Client Components for the question engine and interactive authoring.
- Supabase Auth for email/password identities; Postgres for data and transactions;
  Row Level Security (RLS) for access control.
- Use plain `@supabase/supabase-js` with `@supabase/ssr`, and generated database
  TypeScript types. This keeps the user's JWT and RLS effective end to end and
  avoids a second ORM connection path. Complex writes use migration-defined SQL
  RPC functions so validation and credits share one transaction.
- Use Zod at the server boundary for payload shape validation; database functions
  independently enforce business invariants. Client validation is only UX.

The browser is untrusted. A user-scoped server Supabase client carries the verified
session into Postgres; it does not substitute the service-role key for ordinary
requests. Server actions check authentication and admin permission where relevant.
Every privileged SQL function independently checks the caller and its permissions.

The service-role key is restricted to `server-only` maintenance/bootstrap modules
and any explicitly justified admin-only operation. It bypasses RLS, so merely
using that key does not prove a caller is an admin. Prefer user-scoped admin RPCs.

Authenticated content is dynamic and private; never share-cache a user's surveys,
balance, identity, or responses. Protected layouts and session-refresh middleware
(or the equivalent supported by the selected Next.js release) improve routing;
they do not replace authorization at each action, query, and database boundary.

## 3. Database schema

Application tables use UUID primary keys, `timestamptz` timestamps defaulting to
database time, explicit foreign keys, and indexed foreign-key access paths.
References default to restrict deletion to preserve earned points and history.
Only the profile provisioning trigger needs to reference `auth.users` directly.

| Table | Important columns and constraints | Purpose |
| --- | --- | --- |
| `public.profiles` | `id` PK/FK to `auth.users.id`, `display_name`, `created_at` | One profile per identity, created by a signup trigger. No client-writable role or balance. |
| `private.admin_memberships` | `user_id` PK/FK to profiles, `created_at`, nullable `granted_by` | Authoritative admin allowlist outside the exposed API schema. |
| `public.surveys` | `id`, `title`, `description`, `reward_points integer CHECK >= 0`, `status`, `definition_version integer`, `created_by`, `created_at`, `updated_at`, `published_at`, `archived_at` | Survey metadata, immutable definition and reward after publication. |
| Survey additions | `status` also accepts `needs_review`; `authoring_source` (`manual`/`gemini`, default `manual`); nullable `approved_by` FK to profiles, `approved_at`, `approved_definition_version` | Approval belongs to the current definition version; generated drafts use the existing survey/question tables. |
| `public.survey_questions` | `id`, `survey_id`, `position`, `section`, `field_key`, `type`, `presentation`, `prompt`, `required`, `config jsonb`, unique `(survey_id, position)`, unique `(survey_id, field_key)`, unique `(survey_id, id)` | Ordered public question definitions; no attention-check answer keys. |
| `private.question_checks` | `question_id` PK/FK, `rule jsonb`, `rule_version` | Attention-check answer keys and grading rules visible only through authorized admin functions. |
| `public.survey_pushes` | `id`, `survey_id`, `audience` (`all`/`selected`), `created_by`, `created_at`, unique `request_id`, `request_fingerprint`, `targeted_count`, `new_assignment_count` | Audit record of each successful push, including repeated pushes. Fingerprint binds retries to the original caller and canonical request arguments. |
| `public.survey_push_targets` | `push_id`, `user_id`, composite PK | Snapshot of intended recipients for each push, including previously assigned users. |
| `public.survey_assignments` | `id`, `survey_id`, `user_id`, `first_push_id`, `assigned_at`, unique `(survey_id, user_id)`, unique `(id, survey_id, user_id)` | Each user's entitlement to take a survey. Completion is derived from submissions. |
| `public.survey_submissions` | `id`, `assignment_id` unique, `survey_id`, `user_id`, `submitted_at`, `survey_title_snapshot`, `reward_points_snapshot`, unique `(survey_id, user_id)`, unique `(id, survey_id)`, unique `(id, user_id)` | One accepted completion with immutable historical title and reward. Composite FK to the matching assignment prevents owner/survey mismatches. |
| `public.submission_answers` | `submission_id`, `survey_id`, `question_id`, `answer jsonb`, PK `(submission_id, question_id)` | Answers with composite FKs to the submission's survey and that survey's questions. |
| `private.response_flags` | `submission_id`, `question_id`, `rule_version`, `reason_code`, `created_at`, unique `(submission_id, question_id)` | Failed attention checks stored for admin review, separate from user-readable responses. |
| `public.points_ledger` | `id`, `user_id`, `submission_id` unique, `amount integer CHECK >= 0`, `created_at`; composite FK `(submission_id, user_id)` | Exactly one immutable award per completion. Amount comes from the stored survey reward. |
| `private.survey_imports` | `id`, `created_by` FK, unique `(created_by, request_id)`, `content_hash`, filename/MIME/byte count, `status` (`processing`/`ready`/`failed`), nullable unique `survey_id` FK, model/prompt versions, safe `error_code`, timestamps, `lease_expires_at` | Import provenance and idempotency; raw files, extracted text, prompts, and raw model responses are not persisted. |

`private` is not an exposed PostgREST schema. Deny direct access to private tables
to `anon` and `authenticated`; enable RLS there as defense in depth. Privileged
helpers expose only the narrow result needed by an authenticated admin.

Additional constraints and indexes:

- Constrain status, section, supported type/presentation combinations, and JSON
  object shapes. Publication validates full config and demographic invariants.
- Enforce exactly one each of `age`, `income_bracket`, `marital_status`, and
  `country`, all in the first section; no body question may precede that section.
- Published definitions, question ordering, check rules, and rewards are immutable
  through database guards, including when a service role is used accidentally.
- Index assignments by `(user_id, assigned_at DESC)` and `survey_id`; submissions
  by `(user_id, submitted_at DESC)` and `survey_id`; ledger by `user_id`; questions
  by survey/position; push targets by user; flags by submission.
- Compute balance as `SUM(points_ledger.amount)` using a bigint-compatible result;
  zero when absent. No separately mutable balance counter that can drift.
- A signup trigger provisions profiles with an empty search path and fully qualified
  references. Never copy a role from user-editable signup metadata.
- Account deletion and demographic retention need a separately approved policy
  before adding deletion/anonymization features. Do not imply automatic erasure.

Revision migration requirements:

- Add the survey approval/provenance fields, extend lifecycle checks, and permit
  question/check edits in both `draft` and `needs_review`. Publication requires
  `status = draft` and approval of the current definition version. All edits to
  questions, private check rules, title, description, or reward increment that
  version and clear approval in the same transaction. Published data stays frozen.
- Apply new migrations only. Invalidate admin eligibility for existing assignments,
  including the Phase 2 example, through route/RPC guards; keep immutable audit
  records. Retire `private.install_example_survey` as an admin-assignment mechanism;
  examples for participation tests use isolated non-admin fixtures instead.
- Inspect any pre-revision admin awards before rollout. Existing historical rows
  remain immutable; the new policy prohibits further participation/earnings and
  hides participant views for admins. Retroactive deletion or reversal of existing
  ledger entries is not part of this revision.
- Serialize membership changes with assignment creation, submission, and credit
  creation using a consistent per-profile lock, then recheck eligibility. Database
  guards on assignments/submissions/ledger inserts reject admin recipients even
  through privileged maintenance paths. Promotion immediately disables existing
  assignments; it never permits an award racing after promotion.
- Enable RLS on `private.survey_imports`, deny direct API/table grants, and index
  creator/time and processing lease expiry. Expose only authorized admin RPCs.
  Import attempts do not add a second question schema or a second approval table.

## 4. Question engine and answer contracts

Use normalized question rows with versioned JSON configuration. A question has:

```json
{
  "field_key": "shopping_frequency",
  "section": "body",
  "type": "single_choice",
  "presentation": "dropdown",
  "prompt": "How often do you shop online?",
  "required": true,
  "config": {
    "version": 1,
    "options": [
      { "id": "weekly", "label": "Weekly" },
      { "id": "monthly", "label": "Monthly" },
      { "id": "less_often", "label": "Less often" }
    ]
  }
}
```

| `type` | `presentation` | Configuration | Stored answer |
| --- | --- | --- | --- |
| `single_choice` | `dropdown` or `radio_cards` | Stable option IDs/labels | `{ "option_id": "weekly" }` |
| `multi_choice` | `checkbox_cards` | Options, minimum/maximum selections, optional exclusive option IDs | `{ "option_ids": ["watch", "earbuds"] }` |
| `text` | `short_text` or `long_text` | Minimum/maximum length, with bounded server limits | `{ "text": "My answer" }` |
| `integer` | `number_input` | Inclusive min/max and optional prefer-not-to-say choice | `{ "value": 28 }` or `{ "declined": true }` |

The age question uses integer input with a bounded age range; income and marital
status use configured single-choice options; country uses an ISO country-code
option list. Demographic questions include a stable prefer-not-to-say option (or
the integer declined representation). Required means an explicit answer, including
an allowed decline. Omitted optional answers are stored as no row, not arbitrary
JSON null. User-entered text is plain text and never rendered as raw HTML.

Attention checks are ordinary visible questions plus a **private** rule, for example:

```json
{
  "version": 1,
  "operator": "equals_option",
  "expected_option_id": "blue"
}
```

The server evaluates the rule from stored configuration and inserts a private flag
when it fails. Browser DTOs contain no rule, expected answer, check indicator, or
grading result. A correctly shaped but wrong answer remains a valid completion
and receives the full reward. Unsupported rule operators fail publication.

The engine is a registry of answer schemas, validation functions, renderers, and
allowed presentation formats. Creating surveys, adding questions, switching among
supported formats, and changing options require data changes only. A genuinely
new input behavior requires a new renderer/validator and compatible migration;
arbitrary new question types cannot safely work without executable support.
Unknown types or config versions must fail closed at publication and submission.

On submit, reject unknown/duplicate question IDs, questions from another survey,
invalid option IDs, duplicate selections, forbidden exclusive combinations,
missing required answers, out-of-range numbers, excessive text, and oversized
payloads. Clients never submit accepted points, user IDs, or quality judgments.

### Required-answer navigation

Use question-by-question navigation, with demographics remaining the first section.
Before advancing, run the existing client answer validator for the current question.
Disable Next while a required answer is missing or invalid; the navigation handler
also guards keyboard/Enter and alternate navigation. A valid decline satisfies a
demographic requirement. Optional questions can be skipped; supplied optional
answers must be valid. Attention checks validate answer shape, never correctness,
on the client. Their expected answers remain private.

Back remains available. Edits revalidate immediately; forward jumps/review cannot
bypass an earlier invalid required answer. Submit is disabled and guarded until
all required answers and any supplied optional answers are valid. Associate inline
errors with the field and focus the first invalid question. Server and database
validation remain mandatory. This changes navigation state, not stored answers.

The Phase 2 example survey will demonstrate demographics, social-media usage,
products/accessories owned, shopping frequency, an opinion question, free text,
dropdowns, visible options, and one attention check. Its setup uses the same
validated authoring logic, not an alternate permissive data path.

## 5. Atomic server workflows

### Submit a survey

1. Server action verifies a non-admin Supabase session, bounds payload size, validates shape,
   and invokes `submit_survey(assignment_id, answers)` with the user's JWT.
2. The SQL function obtains `auth.uid()`, locks/rechecks profile eligibility, then
   locks the owned assignment. It rejects admins and unassigned callers before
   receipt replay or writes. It never accepts caller identity as an argument.
3. If already completed, return the existing receipt without another credit.
   Otherwise lock the survey row, confirm it is published, and read its frozen
   questions and reward. Archival and submission serialize on that row.
4. Validate all answers against stored definitions inside the transaction. Insert
   the submission, answers, private attention flags, and one ledger award.
5. Commit together, returning only submission ID, awarded points, and timestamp.
   Any failure rolls everything back. Refresh dashboard/history/balance afterwards.

Unique constraints and locks protect simultaneous requests and network retries;
replayed payloads never modify an accepted completion. The lock order is consistent
across functions to avoid deadlocks. Attention failure does not trigger rollback.

### Author, publish, and push

1. Server actions verify the caller and check database-backed admin membership.
   SQL RPCs repeat the admin check, so direct API requests cannot bypass it.
2. The shared draft-save RPC handles `draft` and `needs_review`, validating and
   writing the entire question definition, including
   private checks, transactionally. Concurrent edits use the definition version
   as an optimistic lock; stale saves return a conflict. The shared Approve action
   validates the complete definition, records approver/time/version, and transitions
   `needs_review` to `draft` (manual drafts remain `draft`). Approval does not assign
   users. Both sources use this action; editing either source clears approval.
3. Push accepts survey ID, audience, optional selected user IDs, expected definition
   version, and a retry-stable request ID. Lock the survey and validate publication
   invariants; refuse `needs_review`, unapproved/stale drafts, or archived surveys.
4. For `all`, materialize eligible non-admin profiles at push time.
   For `selected`, deduplicate and verify every profile ID; reject missing IDs and
   admin recipients. Recheck eligibility under the shared profile-lock convention.
   Record the push and recipient snapshot, then insert missing assignments using
   the unique survey/user constraint. Publish a draft in the same transaction.
5. Return targeted, newly assigned, and already assigned counts. An empty audience
   returns a clear error without publishing. Same request ID and same request
   return the original receipt; conflicting reuse is rejected.

Pushes are atomic database operations, not one browser request per recipient.
Initial implementation targets modest MVP audiences. Measure transaction sizes
before broad distribution; persistent background batching, if needed, requires
an explicit later architecture change. A newly targeted user sees the survey on
their next dashboard fetch/refresh; realtime delivery and notifications are not
required by this brief.

### Admin user roster

`admin_user_roster` is a bounded, paginated, read-only `SECURITY DEFINER` RPC with
an explicit database admin check and empty search path. Join `public.profiles` to
`auth.users` for the current email and aggregate `public.points_ledger` by user;
exclude admin memberships. Return only user ID, nullable display name/email,
created timestamp for stable pagination, and total earned points (zero when no
ledger rows exist; bigint sum serialized as a decimal string to preserve precision).
No email duplication/synchronization column or mutable balance table is needed.
Do not grant clients access to `auth.users` or expose Auth metadata. The roster
has no edit, role-change, balance-adjustment, or export action in this scope.

### LLM-assisted survey authoring

1. An admin uploads a `.docx`, `.pdf`, or `.txt` file and supplies the survey's fixed
   reward. Authenticate and verify current admin membership before accepting work.
   Default limits: one file, 4 MiB upload, 100 PDF pages, 20 MiB expanded DOCX, and
   50,000 extracted characters. Check content signature as well as extension/MIME;
   reject malformed, encrypted, empty, or image-only documents with a clear error.
   OCR is outside this initial feature. Stream-bound multipart parsing and bounded
   extraction prevent oversized/ZIP-bomb inputs; do not fetch embedded external URLs.
2. Extract text in a Node server module (DOCX paragraph/table extraction, PDF text
   extraction, UTF-8 TXT). Parse in memory; never run document macros. Record import
   metadata and an expiring processing lease. Do not log or retain document text.
3. Call Gemini server-side with `GEMINI_API_KEY`; configure the supported model via
   server settings and record model/prompt versions. The upload UI explains that
   the extracted requirement text is sent to Gemini. Delimit document text as
   untrusted source material. The model has no tools, DB access, or authority to
   change roles, rewards, assignments, approval state, or published content.
4. Request structured JSON conforming to the existing internal authoring contract:
   title/description and the existing question `type`, `presentation`, `field_key`,
   `prompt`, `required`, and versioned `config`; private checks use the existing
   check-rule contract. Server code supplies database IDs and the mandatory
   demographic section from the same templates used by manual authoring. No
   SurveyJS, second renderer, or parallel model-specific question format is added.
   The admin-entered reward is authoritative, never a model-generated amount.
5. Treat output as untrusted: parse and validate it with the same strict schemas
   and database definition validator used by manual saves, including allowed types,
   options, length limits, demographics, and private check separation. Never persist
   malformed output as a publishable survey or execute generated code/SQL. Fail
   the import with a safe error rather than silently inventing missing requirements.
6. In one authorized transaction, create the survey in `needs_review`, its question
   rows/private checks, and the import-to-survey link; mark the import `ready`.
   Recheck admin membership at persistence. `ready` means generation succeeded,
   not approval. No assignments or points are created. Open the normal survey
   builder for editing, followed by the same Approve and Push actions as manual work.

Use bounded request execution on Vercel: enforce a Gemini timeout and at most one
bounded retry within the deployment's configured duration. Confirm that duration
before enabling the feature; no unawaited work after a response. Record a safe
failure on provider/validation errors. An expired lease makes an interrupted import
retryable. Retrying uses the same request ID and content hash, with re-upload because
raw content is not retained; a completed retry returns the original draft. Reject
conflicting request-ID reuse and prevent duplicate drafts or overlapping generation
for one lease. Apply per-admin rate limits and a global generation concurrency cap
in the database. Only metadata is durable; this is not a background job service.

### Admin identity and bootstrap

Admin status comes solely from `private.admin_memberships`, queried against the
verified auth identity on every sensitive request. Never trust an email supplied
by the browser, a form field, local storage, or user-editable auth metadata.

Phase 1 requires the owner to identify the first admin's registered auth UUID.
Provision membership via a narrowly scoped server-only bootstrap operation, with
no public bootstrap endpoint. Record who/when; permit no self-promotion. This is
an operational data change, not a substitute for committed schema migrations.

## 6. RLS, grants, and permissions

Enable RLS on every application table. `anon` has no application-table access;
Supabase Auth handles public signup/login. Apply explicit grants as well as RLS.

| Data | Regular authenticated user | Admin |
| --- | --- | --- |
| Profiles | Read own; update only display name through a narrow RPC | Read profiles for targeting; no arbitrary role fields |
| Surveys/questions | Read assigned published surveys, plus own completed survey definitions after archival | Read/manage authoring definitions, including `needs_review`; no participant flow |
| Assignments | Read own | Read all; create only through push RPC |
| Pushes/targets | No direct access | Read audit data; writes only through push RPC |
| Submissions/answers | Read own; create only through non-admin submit RPC | Read all for review; cannot submit or rewrite answers |
| Points ledger | Read own; no direct writes | Read for reporting; cannot earn or edit points |
| Admin memberships | No direct access | Boolean membership helper only; bootstrap outside ordinary app |
| Check rules/response flags | No access | Authorized admin read/write functions as appropriate; published rules stay immutable |
| Roster/email/totals | No roster or other-user email access | Read-only roster RPC; no direct Auth-table grants |
| Import metadata | No access | Admin-only RPCs; processing/retry restricted to initiating admin, linked surveys use normal admin permissions |

Participant RPCs `available_surveys`, `assigned_survey`, and `submit_survey` deny
admins, regardless of old assignments. Keep separate admin authoring/review reads;
RLS's legitimate admin reporting access must not imply participation permission.
Eligibility guards also apply to future balance/history endpoints and both targeting
modes. `needs_review` content is admin-only and can never appear in a user's feed.

Survey visibility uses `EXISTS` on the caller's assignment and survey lifecycle;
question visibility follows that survey predicate. A user's submission/answer
access follows submission ownership. Admin access uses a private membership helper
that bypasses only the recursion needed to read membership, never profiles.
Design assignment/submission policies around direct ownership columns to avoid
recursive policy cycles. Avoid views with accidental owner-privilege RLS bypass;
use invoker-safe reads or explicitly authorized aggregates.

No direct `INSERT`, `UPDATE`, or `DELETE` grants for user responses, awards,
assignments, push audits, or published definitions. Authenticated users instead
receive `EXECUTE` only for the necessary RPC entry points. This is how users write
their own responses while the database preserves atomic awards and permissions.

For any `SECURITY DEFINER` function: empty fixed `search_path`, fully qualified
objects, explicit `auth.uid()` null/role/ownership checks, no dynamic SQL from
client input, minimal ownership privileges, and revoked default `PUBLIC` execution.
Grant only intended entry points. Internal grading and credit helpers are not
callable RPCs. Admin-only functions must reject a non-admin authenticated caller.

## 7. Routes and request boundaries

Route groups below organize layouts without changing URLs.

| URL | Audience | Purpose |
| --- | --- | --- |
| `/` | Public | Route admins to `/admin`, non-admin users to dashboard, others to login |
| `/signup` | Public | Email/password signup and confirmation instructions |
| `/login` | Public | Email/password login, safe internal redirect destination |
| `/auth/confirm` | Auth callback | Validate supported confirmation token/flow and redirect safely |
| `/dashboard` | Non-admin user | Available assigned surveys; admins redirect to `/admin` |
| `/surveys/[assignmentId]` | Owning non-admin user | Required-answer-gated question navigation; admins redirect to `/admin` |
| `/surveys/[assignmentId]/complete` | Owning non-admin user | Receipt read from the stored submission |
| `/history` | Non-admin user | Paginated completion history plus total balance |
| `/admin` | Admin | Survey-management overview |
| `/admin/users` | Admin | Read-only roster: display name, email, total points |
| `/admin/surveys/new` | Admin | Draft authoring |
| `/admin/surveys/import` | Admin | Requirement-document upload, processing/error state, link to generated draft |
| `/admin/surveys/[surveyId]` | Admin | Shared builder for `draft`/`needs_review`, approval, or read-only published preview; archive/copy |
| `/api/admin/survey-imports` | Admin POST | Bounded multipart extraction/generation; never a public upload endpoint |
| `/api/admin/survey-imports/[importId]` | Admin GET/POST | Owner-authorized status / retry with re-upload and idempotency checks |
| `/admin/surveys/[surveyId]/push` | Admin | All/selected targeting and push receipt |
| `/admin/surveys/[surveyId]/responses` | Admin | Paginated answers and private quality flags |

Use server actions for signup/login/logout, submission, draft saves, copying,
approval, archiving, and pushing. Use route handlers for Auth callbacks and bounded
multipart imports. Validate all route IDs server-side. Render consistent not-found
or forbidden behavior without leaking unassigned survey titles. Use framework
origin/CSRF protections and validate callback redirects against local allowed paths.

## 8. Planned folder structure

```text
ARCHITECTURE.md
README.md
.env.example                  # Placeholder values only
src/
  app/
    (auth)/login/page.tsx
    (auth)/signup/page.tsx
    auth/confirm/route.ts
    (user)/layout.tsx
    (user)/dashboard/page.tsx
    (user)/history/page.tsx
    (user)/surveys/[assignmentId]/page.tsx
    (user)/surveys/[assignmentId]/complete/page.tsx
    admin/layout.tsx
    admin/page.tsx
    admin/users/page.tsx
    admin/surveys/new/page.tsx
    admin/surveys/import/page.tsx
    admin/surveys/[surveyId]/page.tsx
    admin/surveys/[surveyId]/push/page.tsx
    admin/surveys/[surveyId]/responses/page.tsx
    api/admin/survey-imports/route.ts
    api/admin/survey-imports/[importId]/route.ts
    actions/                  # Auth, submit, and admin server actions
    layout.tsx
    page.tsx
    globals.css
  components/
    ui/
    layout/
    survey/                   # Runner, section navigation, field renderers
    admin/                    # Builder and targeting controls
  lib/
    supabase/                 # Browser/server factories and session refresh
    auth/                     # Verified user and admin guards
    survey/                   # Public schemas, registry, safe DTOs
    server/                   # server-only grading/admin data access
      imports/                # Bounded extraction, Gemini client, prompt, leases
    data/                     # Typed user-scoped queries
    validation/
  types/database.ts           # Generated from migrated schema
supabase/
  config.toml
  migrations/                 # Timestamped, append-only SQL migrations
  seed.sql                    # Local/test fixtures only; no credentials
tests/
  database/                  # RLS, RPC authorization, and transaction invariants
  integration/
  e2e/
```

Select the supported Next.js release during Phase 1 and use its corresponding
session-refresh file convention (`proxy.ts` or `middleware.ts`). The planned
structure is not a claim that these files already exist.

## 9. Environment, migrations, and deployment

Phase 0 inspection: the repository is on `main` with remote
`https://github.com/Tanishktewetia/PollPoint.git`. `.env` is ignored and untracked;
`.env.*` is ignored except `.env.example`. No credentials belong in this document,
commits, command output, fixtures, or browser bundles.

The environment-name inspection found `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. It did not find a standard
`NEXT_PUBLIC_SUPABASE_URL` assignment. Phase 1 verified configuration without
printing secrets and used the project URL supplied in the brief:
`https://skquddbddxbdsvwkwbza.supabase.co`.

Phase 1 update: the supplied URL was added to the ignored local `.env`; both keys
were preserved. Supabase Auth is reachable and requires email confirmation.

Next.js does not expose an unprefixed environment variable to browser code.
Keep `SUPABASE_ANON_KEY` as the server input and explicitly pass only that public
anon key and URL into the browser client provider. Alternatively a documented
public alias may be configured during Phase 1. Never spread the environment into
props or export the service-role key through `next.config` or `NEXT_PUBLIC_*`.

All schema changes, grants, RLS policies, triggers, indexes, and database functions
must be new committed files under `supabase/migrations/<timestamp>_<name>.sql`.
Never apply ad hoc remote DDL or edit an already applied migration. Test migration
replay in local Supabase or an isolated test database first; regenerate types
afterward. Avoid destructive resets against the hosted project.

The brief reports an existing Supabase/GitHub link and says pushes to `main` are
tracked. That configuration has not been inspected. Confirm in Phase 1 whether
the integration actually applies production migrations and which status checks
prove success; a repository link alone is not proof that DDL was applied.

The owner subsequently confirmed production migration deployment from `main`.
Phase 1 pushed both tested migrations through that integration. The Supabase
check completed successfully and hosted tests verified the schema, profile trigger,
RLS, Auth confirmation, login/logout, and non-admin denial. The owner's confirmed
Auth UUID was provisioned as the first admin using the restricted bootstrap RPC.

Phase 1 uses Next.js 16 with `src/proxy.ts`. Database types are generated from the
actual migrated PostgreSQL catalog using the embedded PGlite test database, so
type regeneration and RLS tests do not require Docker. PGlite shims Supabase Auth's
identity table/function; hosted checks separately verify the real Auth integration.
Phase 2 added configuration/publication validation and atomic submission RPCs.
Its historical example migration assigned admins; this is superseded by the
non-participation revision. A follow-up migration/guard change must disable that
eligibility without editing applied migrations or erasing audit records.

Dashboard and assignment reads use invoker-security JSON RPCs (`available_surveys`
and `assigned_survey`) with RLS and explicit caller ownership. The revision adds
non-admin eligibility checks. The dashboard fetches 20 records plus one pagination sentinel.
`submit_survey` locks the owned assignment exclusively and the survey in shared
mode, allowing distinct users to submit concurrently while serializing with
archival. It validates a maximum of 100 answers and 64 KiB of answer JSON.

The server supports an optional `SUPABASE_URL` runtime override while retaining
the brief's `NEXT_PUBLIC_SUPABASE_URL` default. This allows an isolated test app
to use a local API adapter without rebuilding public environment constants.
The browser never receives a service key. Integration tests run real PostgreSQL
17 in a temporary local cluster and the production Next.js build; a test-only
HTTP adapter supplies Auth identity and forwards RPCs under the authenticated
database role. Hosted checks separately verify actual Supabase Auth and RPC denial.

**Migration credential correction:** a Supabase service-role JWT is a Data API
credential, not a PostgreSQL connection credential and not a general SQL executor.
The Phase 1 wording “run schema/migrations via service role key” therefore cannot
be implemented literally through standard Supabase APIs. Use the configured
GitHub migration deployment if available, or Supabase CLI migration deployment
with the necessary project authorization/database connection credentials. Always
apply the committed migration files, never a replacement one-off SQL payload.
Confirm the deploy mechanism before any remote migration to avoid duplicate runners.

Vercel hosts the Next.js app. Configure public URL/anon and server-only secrets in
its environment settings; set Supabase site URL and allowed redirect URLs for
local development and production. Keep preview deployments on an isolated
Supabase environment before allowing preview writes. Production deployment and
domain verification belong to Phase 5.

`GEMINI_API_KEY` is supplied in the local `.env` per the owner. Read it only from
server-only import modules; configure it as a server secret in Vercel. Never use
a `NEXT_PUBLIC_*` alias, return it to clients, or log provider request headers.
Missing/invalid Gemini configuration disables generation with an admin-facing
error; manual authoring continues to work. Confirm the chosen Gemini model supports
the required structured JSON contract during Phase 4 implementation.

## 10. Validation and phase gates

| Phase | Deliverable and meaningful verification |
| --- | --- |
| 0 | Resolve section 1, finalize this document, check no secret files staged, commit and push documentation, stop for explicit approval. |
| 1 | Scaffold, typed Supabase clients, versioned schema/RLS/RPC foundations, auth and protected shells. Test migrations from empty DB, signup/confirmation/login/logout, cross-user RLS denial, and non-admin RPC denial. Confirm migration deployment status. |
| 2 | Dashboard and all question renderers, example survey, validated atomic submission. Test invalid answers, unassigned access, concurrent/double submissions, full reward despite failed attention checks, flag/key isolation, and archive/submission races. |
| 2A — complete | After architecture approval: remove admin participation/earning, retire admin example eligibility, and enforce client required-answer navigation. Test direct admin RPC denial, promotion/submission races, keyboard/forward-jump bypasses, decline/optional answers, and retained server validation. Commit/push separately, then continue to the authorized Phase 3. |
| 3 — implemented | Non-admin history and balance, authorized immediately after Phase 2A. Reconcile ledger totals and test ownership/admin exclusion. |
| 4 — expanded | Shared survey builder/approval/push/review plus read-only user roster and Gemini document import. Build shared authoring/approval first, then import into that same path. Test admin-excluded all/selected targeting, roster email/aggregate isolation, import type/size/extraction limits, provider timeout/malformed output, prompt injection, lease/idempotency retries, `needs_review` publication denial, edit-invalidated approval, and successful shared approval/push. |
| 5 | Vibrant styling, mobile/tablet/desktop QA, keyboard/focus/error accessibility, production build, Vercel deploy, Auth redirect and production smoke checks, final README. |

Use database tests for permissions and transactional invariants and a small number
of integration/browser tests for critical flows. Perform lint/type/build checks as
appropriate once application code exists. Report unavailable services or credentials
as unverified dependencies rather than claiming successful integration.

The owner approved Phase 2A followed immediately by Phase 3, with separate commits
and pushes. Stop before Phase 4; the roster and Gemini pipeline remain there.

At each phase completion, use conventional commits, push each commit to the
authorized repository, summarize changes and verification, and stop for review.
Because the brief explicitly requests `main` pushes for the linked migration
workflow, follow that branch convention unless the owner changes it. Do not start
the next phase until the owner explicitly approves it.


Phase 2A deployed in `a283bed`; Supabase and GitHub CI checks passed. Hosted
read-only verification confirms the participant guard. One historical admin award
(100 points) remains preserved, while new participation is denied.

Phase 3 adds `participant_history(integer)`, an invoker-security JSON RPC with
explicit non-admin authorization and ownership filtering. It returns immutable
completion snapshots, 20 entries plus a pagination sentinel, and the ledger SUM
as a decimal string, including zero for an empty ledger. The UI formats that
string through BigInt without converting to JavaScript Number. Existing RLS and
grants remain intact; an additional ordered index supports history pagination.
`/history` shows the balance, completion dates, and stored receipt links, including
archived surveys. Submission revalidates history. No points redemption is added.
