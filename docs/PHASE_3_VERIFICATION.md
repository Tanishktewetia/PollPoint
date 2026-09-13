# Phase 3 verification

Implemented `/history` with a ledger-backed total, paginated completions, UTC dates,
and stored receipt links. Archived completions and zero-point awards remain visible.
User navigation links to history with an active-page indicator. Admins cannot access
the page or its RPC. Submitting a survey refreshes history and balance.

`participant_history(integer)` uses invoker security, RLS, explicit caller ownership,
and non-admin checks. Its ledger SUM is a decimal string; BigInt formatting preserves
precision. History uses stored submission title/reward snapshots, never live survey
metadata. Added an index supporting date/ID pagination. No existing migrations changed.

Passed: lint, TypeScript, production build, 7 unit tests and 23 database tests.
History tests cover empty/zero-point results, archived snapshots, ledger reconciliation,
large totals, pagination boundaries, caller isolation, anonymous/admin denial, and
precision above JavaScript's safe integer limit. The production browser flow passed
empty/populated history, both pagination directions, receipts, mobile overflow, active
navigation, and admin redirects. All 4 auth/browser regressions passed.
Reward-producing tests use isolated databases; hosted smoke tests create no awards.

Migration: `20260913000600_participant_history.sql`.
Phase 4 (builder, targeting, responses, roster, Gemini imports) has not started.
