# PollPoint

A responsive survey and rewards app using Next.js App Router, React, TypeScript,
Tailwind CSS, and Supabase Auth/Postgres. Vercel hosts the entire application.

Participants complete assigned surveys, review answers, and receive one fixed
award per completion. History and balances use the immutable points ledger.
Required answers are enforced during navigation and again by PostgreSQL on submit.
Attention checks flag responses for admins without reducing rewards.

Admins manage surveys through one builder: save, approve, then push to all current
participants or selected accounts. First publication freezes questions and reward;
copy a published survey to revise it. Admins cannot participate or earn new points.
The read-only roster shows participant names, current emails, and total points.
Document imports generate `needs_review` drafts in that same builder and approval path.

See [architecture](./ARCHITECTURE.md) and [Phase 5 verification](./docs/PHASE_5_VERIFICATION.md).
Production is configured at [pollpoint.vercel.app](https://pollpoint.vercel.app).
Its HTTP 500 is traced to Supabase environment validation in the request proxy;
the exact failing variable is being diagnosed. Local QA passing does not establish
production readiness.

## Local development

Requires Node.js 22.18+; Node 24 is recommended.

```sh
npm ci
```

Copy `.env.example` to `.env` only if it does not already exist. Set the Supabase
URL and anon key, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, and the server-only
Gemini key for document generation. Keep `.env` untracked.

Apply the committed migrations to the intended Supabase project, then run:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Profile creation is automatic on signup;
signup metadata cannot grant admin access. The confirmed first admin is already
provisioned. For a new installation only, `npm run admin:bootstrap -- <confirmed-user-uuid>`
uses the service-role key and a restricted one-time RPC.

## Existing Vercel deployment

Use project **pollpoint** (`prj_2FspAJu5Tohdsfrc4rVDqd4NPWKz`), not a new project.
In **Settings → Build and Deployment**, use the Next.js framework preset, repository
root, `npm run build`, and the framework's default output directory. Node 24 is the
recommended runtime. The project uses Hobby with Fluid Compute enabled.

In **Settings → Environment Variables**, configure:

| Variable                    | Production value / purpose                                |
| --------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | `https://skquddbddxbdsvwkwbza.supabase.co`                |
| `SUPABASE_ANON_KEY`         | Supabase anon key; user-scoped clients enforce RLS        |
| `GEMINI_API_KEY`            | Server-only Google Gemini key                             |
| `NEXT_PUBLIC_SITE_URL`      | `https://pollpoint.vercel.app`                            |
| `GEMINI_MODEL`              | Optional; defaults to `gemini-3.6-flash`                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing operational key; the application does not use it |

The owner has already configured the Supabase and Gemini keys in Production and
Preview. The production site URL is an additional Auth requirement. Environment
changes apply to new deployments: **Deployments → latest deployment → … → Redeploy**.
Never prefix service-role or Gemini secrets with `NEXT_PUBLIC_`.

For previews, use an isolated Supabase project with its own callback allowlist.
Leave the production site URL out of Preview; the app can use `VERCEL_URL`, or set
an explicit preview origin. Check **Settings → Git** points to the existing repository
and `main` production branch. Pushing an approved commit triggers the connected deployment.

### Diagnose an existing HTTP 500

For a deployed site showing “Internal Server Error,” start with **pollpoint → Logs
(Runtime Logs)**. Select Production, reload the failing URL, and open the matching
request by timestamp/path. Capture its error message and stack trace, redacting
credentials and tokens. This is more useful than the browser's generic 500.

If the deployment itself is Failed, use **Deployments → failed deployment → Build
Logs** and capture the first relevant build error. Do not infer a runtime cause
from a successful build or from an unrelated configuration omission.

### Import duration and packaging

The Node import route exports `maxDuration = 120`. Vercel's documented Hobby limit
with Fluid Compute is **300 seconds**, so 120 seconds is supported without a plan
upgrade. The local production function manifest records 120; output tracing includes
the extraction worker and PDF parser. Verify the deployed function configuration
and a real import after resolving production's HTTP 500.

Reference: [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

## Supabase migrations and Auth

`supabase/migrations/*.sql` is the source of truth. Never edit applied migrations.
The configured GitHub integration applies migrations from `main`; check its status
and run `npm run db:check`. Do not run a second migration mechanism concurrently.
For a separate installation, authenticated Supabase CLI plus database authorization
can apply these files using `npx supabase db push`. A service-role API key cannot run DDL.

In **Authentication → URL Configuration**, set exactly:

- **Site URL:** `https://pollpoint.vercel.app`
- **Redirect URLs:** `https://pollpoint.vercel.app/auth/confirm`
- Keep `http://localhost:3000/auth/confirm` for local development.

Enable email/password and email confirmations. In **Authentication → Email Templates
→ Confirm signup**, use this confirmation link for cross-browser confirmation:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
  >Confirm email</a
>
```

The app also supports standard PKCE `code` callbacks, which require the initiating
browser. Configure production SMTP and appropriate Auth rate limits for public signup.
Reference: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Document authoring

Upload one `.txt`, `.docx`, or text-based `.pdf` from `/admin/surveys/import`.
Limits: 4 MiB upload, 100 PDF pages, 20 MiB expanded DOCX, 50,000 extracted characters.
Image-only/encrypted PDFs need preparation first. Extraction has a 15-second budget,
upload 15 seconds, and Gemini 60 seconds within the 120-second route budget.

The UI discloses that extracted text is sent to Gemini. PollPoint retains import
metadata and validated drafts, not raw files, extracted text, or raw provider output.
Model results must satisfy the existing question schema; demographics are added from
the shared template. Admins edit, approve, and push through the manual authoring path.
Editing invalidates approval. Retry the same file/reward to recover an interrupted
operation without duplicating the draft. Manual authoring remains available on failure.

## Verification

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

Unit and PGlite database tests cover validation, RLS, admin enforcement, immutable
history, imports, and awards. Concurrency tests use independent PostgreSQL 17
sessions. The survey browser test uses an isolated PostgreSQL cluster, a test-only
Supabase adapter on port 54329, and the production Next.js build on port 3001.
It exercises survey completion and the shared admin/import workflow without hosted
responses or rewards. Only that isolated process mocks Gemini.

Build before browser tests. Microsoft Edge is used locally; CI installs Chromium.
The accessibility helper checks WCAG A/AA rules at 390, 768, and 1440px and reflow at
320px. Screenshots are in ignored `test-results/phase-5/`. Run `test:e2e` before the
survey integration test because Playwright clears the results directory.
Automated checks do not replace physical-device or screen-reader testing.

`npm run test:hosted` is an opt-in smoke test against a local app and real Supabase.
It creates one temporary Auth identity through an Admin-generated confirmation link,
tests confirmation/login/logout and non-admin denial, and removes that identity and
its empty profile. It sends no email and awards no points. It currently restricts the
app origin to localhost; a production Auth smoke check remains a separate launch step.

## Security and retained history

Protected routes verify Auth; SQL RLS and guarded RPCs enforce ownership and admin
membership independently. No client can choose awards or write ledger rows directly.
Submission validates and awards atomically; retries return the existing receipt.
Private attention rules never reach participants. Private responses use session
cookies and `private, no-store`; callback destinations remain within the app.

The first admin's historical **100-point award is preserved** and excluded from the
participant-only roster. No cleanup has been performed; that decision remains with
the owner. New admin participation and earnings are denied.
