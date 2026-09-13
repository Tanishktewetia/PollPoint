# PollPoint Architecture

Status: Phase 2 completed and deployed on 2026-09-13; awaiting Phase 3 approval.
Product decisions in section 1 are confirmed. Each later phase still requires its
own explicit approval.

## 1. Product decisions and scope

The owner confirmed the following product decisions on 2026-09-13:

| Decision | Confirmed behavior | Schema consequence |
| --- | --- | --- |
| Push to all | Target registered users at push time. Later signups require another push. | Materialized per-user assignments; no persistent audience subscription. |
| Completion and revisions | One completion and fixed reward per user per survey. Freeze questions and reward on publication; copy to a new survey for revisions. | Unique user/survey submission and assignment; immutable published question definitions and reward. |
| Demographics | Required first section on every completion, with a “Prefer not to say” answer; store per completion. | Demographic questions and answers belong to the survey, not the profile. Income labels specify currency and period. |

Changes to these choices require updating the dependent schema, permissions, and
flows below before implementation proceeds.

Other implementation choices:

- Rewards are nonnegative integer points set by an admin, credited on successful
  submission. Failed attention checks never reduce, delay, or block the reward.
- Points are an earnings ledger. Redemption, cash conversion, transfers, and manual
  adjustments are outside the brief and outside the initial schema.
- Survey states are `draft`, `published`, and `archived`. First push publishes a
  valid draft atomically. Published surveys may be pushed again to additional users.
- Archiving removes an unfinished survey from availability. Completed history and
  earnings remain accessible. No survey hard-delete or assignment revocation UI.
- The initial release has no expiry, branching, quotas, partial credit, timed
  surveys, or persisted answer drafts. A failed network submission can be retried.
- Admins retain ordinary user capabilities; “all users” includes their profiles.
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
| `public.survey_questions` | `id`, `survey_id`, `position`, `section`, `field_key`, `type`, `presentation`, `prompt`, `required`, `config jsonb`, unique `(survey_id, position)`, unique `(survey_id, field_key)`, unique `(survey_id, id)` | Ordered public question definitions; no attention-check answer keys. |
| `private.question_checks` | `question_id` PK/FK, `rule jsonb`, `rule_version` | Attention-check answer keys and grading rules visible only through authorized admin functions. |
| `public.survey_pushes` | `id`, `survey_id`, `audience` (`all`/`selected`), `created_by`, `created_at`, unique `request_id`, `request_fingerprint`, `targeted_count`, `new_assignment_count` | Audit record of each successful push, including repeated pushes. Fingerprint binds retries to the original caller and canonical request arguments. |
| `public.survey_push_targets` | `push_id`, `user_id`, composite PK | Snapshot of intended recipients for each push, including previously assigned users. |
| `public.survey_assignments` | `id`, `survey_id`, `user_id`, `first_push_id`, `assigned_at`, unique `(survey_id, user_id)`, unique `(id, survey_id, user_id)` | Each user's entitlement to take a survey. Completion is derived from submissions. |
| `public.survey_submissions` | `id`, `assignment_id` unique, `survey_id`, `user_id`, `submitted_at`, `survey_title_snapshot`, `reward_points_snapshot`, unique `(survey_id, user_id)`, unique `(id, survey_id)`, unique `(id, user_id)` | One accepted completion with immutable historical title and reward. Composite FK to the matching assignment prevents owner/survey mismatches. |
| `public.submission_answers` | `submission_id`, `survey_id`, `question_id`, `answer jsonb`, PK `(submission_id, question_id)` | Answers with composite FKs to the submission's survey and that survey's questions. |
| `private.response_flags` | `submission_id`, `question_id`, `rule_version`, `reason_code`, `created_at`, unique `(submission_id, question_id)` | Failed attention checks stored for admin review, separate from user-readable responses. |
| `public.points_ledger` | `id`, `user_id`, `submission_id` unique, `amount integer CHECK >= 0`, `created_at`; composite FK `(submission_id, user_id)` | Exactly one immutable award per completion. Amount comes from the stored survey reward. |

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

The Phase 2 example survey will demonstrate demographics, social-media usage,
products/accessories owned, shopping frequency, an opinion question, free text,
dropdowns, visible options, and one attention check. Its setup uses the same
validated authoring logic, not an alternate permissive data path.

## 5. Atomic server workflows

### Submit a survey

1. Server action verifies the Supabase session, bounds payload size, validates shape,
   and invokes `submit_survey(assignment_id, answers)` with the user's JWT.
2. The SQL function obtains `auth.uid()`, locks the owned assignment, and rejects an
   unassigned caller. It never accepts the caller's identity as an argument.
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
2. Draft-save RPC validates and writes the entire question definition, including
   private checks, transactionally. Concurrent edits use the definition version
   as an optimistic lock; stale saves return a conflict.
3. Push accepts survey ID, audience, optional selected user IDs, expected definition
   version, and a retry-stable request ID. Lock the survey and validate publication
   invariants; refuse archived surveys or stale draft versions.
4. For `all`, materialize profiles visible in the push transaction's target query.
   For `selected`, deduplicate and verify every profile ID; reject invalid targets.
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
| Surveys/questions | Read assigned published surveys, plus own completed survey definitions after archival | Read all; mutate drafts through admin RPCs |
| Assignments | Read own | Read all; create only through push RPC |
| Pushes/targets | No direct access | Read audit data; writes only through push RPC |
| Submissions/answers | Read own; create only through submit RPC | Read all; cannot rewrite accepted answers |
| Points ledger | Read own; no direct writes | Read all; no general ledger editing API |
| Admin memberships | No direct access | Boolean membership helper only; bootstrap outside ordinary app |
| Check rules/response flags | No access | Authorized admin read/write functions as appropriate; published rules stay immutable |

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
| `/` | Public | Redirect authenticated users to dashboard, others to login |
| `/signup` | Public | Email/password signup and confirmation instructions |
| `/login` | Public | Email/password login, safe internal redirect destination |
| `/auth/confirm` | Auth callback | Validate supported confirmation token/flow and redirect safely |
| `/dashboard` | Authenticated | Available assigned surveys, reward summary, take-survey CTA |
| `/surveys/[assignmentId]` | Owning user | Mandatory demographic section followed by survey questions |
| `/surveys/[assignmentId]/complete` | Owning user | Receipt read from the stored submission |
| `/history` | Authenticated | Paginated completion history plus total balance |
| `/admin` | Admin | Survey-management overview |
| `/admin/surveys/new` | Admin | Draft authoring |
| `/admin/surveys/[surveyId]` | Admin | Edit draft or view frozen published definition; archive/copy |
| `/admin/surveys/[surveyId]/push` | Admin | All/selected targeting and push receipt |
| `/admin/surveys/[surveyId]/responses` | Admin | Paginated answers and private quality flags |

Use server actions for signup/login/logout, submission, draft saves, copying,
archiving, and pushing. Reserve route handlers for Auth callbacks and genuine HTTP
integration needs. Validate all route IDs server-side. Render consistent not-found
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
    admin/surveys/new/page.tsx
    admin/surveys/[surveyId]/page.tsx
    admin/surveys/[surveyId]/push/page.tsx
    admin/surveys/[surveyId]/responses/page.tsx
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
Phase 2 adds strict question configuration/publication validation and atomic
submission RPCs. Admin authoring/push RPCs remain Phase 4. The Phase 2 example
survey is installed by a committed migration and assigned only to admins who
exist at migration time. It awards 100 points and uses all 249 ISO country codes
plus a decline option. No general survey-push API is introduced early.

Dashboard and assignment reads use invoker-security JSON RPCs (`available_surveys`
and `assigned_survey`) with RLS and explicit caller ownership, including for admin
participants. The dashboard fetches 20 records plus one pagination sentinel.
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

## 10. Validation and phase gates

| Phase | Deliverable and meaningful verification |
| --- | --- |
| 0 | Resolve section 1, finalize this document, check no secret files staged, commit and push documentation, stop for explicit approval. |
| 1 | Scaffold, typed Supabase clients, versioned schema/RLS/RPC foundations, auth and protected shells. Test migrations from empty DB, signup/confirmation/login/logout, cross-user RLS denial, and non-admin RPC denial. Confirm migration deployment status. |
| 2 | Dashboard and all question renderers, example survey, validated atomic submission. Test invalid answers, unassigned access, concurrent/double submissions, full reward despite failed attention checks, flag/key isolation, and archive/submission races. |
| 3 | Paginated history and balance. Reconcile totals to ledger, test zero state, zero-point survey, archived completion history, and ownership isolation. |
| 4 | Admin authoring, publication, targeting, and response review. Test selected/all targeting, future-signup behavior, push retries, stale draft saves, frozen definitions, and forbidden direct mutations. |
| 5 | Vibrant styling, mobile/tablet/desktop QA, keyboard/focus/error accessibility, production build, Vercel deploy, Auth redirect and production smoke checks, final README. |

Use database tests for permissions and transactional invariants and a small number
of integration/browser tests for critical flows. Perform lint/type/build checks as
appropriate once application code exists. Report unavailable services or credentials
as unverified dependencies rather than claiming successful integration.

At each phase completion, use conventional commits, push each commit to the
authorized repository, summarize changes and verification, and stop for review.
Because the brief explicitly requests `main` pushes for the linked migration
workflow, follow that branch convention unless the owner changes it. Do not start
the next phase until the owner explicitly approves it.
