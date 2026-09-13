import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { required } from "./env.mjs";

const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const userClient = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Run hosted smoke checks against a local application server.");
const email = `pollpoint-smoke-${randomUUID()}@example.com`;
const password = `${randomUUID()}Aa1!`;
let userId;
let browser;
try {
  // generateLink creates the signup identity and confirmation token WITHOUT mail.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup", email, password, options: { redirectTo: `${origin}/auth/confirm` },
  });
  if (error) throw new Error(`Test signup setup failed (${error.code ?? error.status}).`);
  userId = data.user.id;
  const confirmationRedirect = new URL(data.properties.action_link).searchParams.get("redirect_to");
  assert.equal(confirmationRedirect, `${origin}/auth/confirm`, "Supabase must allow the application's confirmation callback URL");
  const { data: profile, error: profileError } = await admin.from("profiles").select("id").eq("id", userId).single();
  assert.ifError(profileError);
  assert.equal(profile.id, userId, "Auth signup must provision a profile");
  console.log("Hosted signup identity and profile provisioning passed (no email sent).");

  const beforeConfirmation = await userClient.auth.signInWithPassword({ email, password });
  assert.equal(beforeConfirmation.error?.code, "email_not_confirmed");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${origin}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`);
  await page.waitForURL(`${origin}/dashboard`);
  await page.getByRole("heading", { name: "Your next opinion could be a rewarding one." }).waitFor();
  console.log("Real confirmation callback, session cookies, and protected dashboard passed.");

  await page.goto(`${origin}/admin`);
  await page.waitForURL(`${origin}/dashboard?notice=admin-only`);
  await expect(page.getByRole("status").filter({ hasText: "does not have admin access" })).toBeVisible();
  console.log("Hosted non-admin route rejection passed.");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(`${origin}/login`);
  await page.goto(`${origin}/dashboard`);
  await page.waitForURL(/\/login\?next=/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${origin}/dashboard`);
  console.log("Real login, logout, and signed-out route protection passed.");

  const signedIn = await userClient.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  const { data: profiles, error: readError } = await userClient.from("profiles").select("id");
  assert.ifError(readError);
  assert.deepEqual(profiles, [{ id: userId }]);
  assert.equal((await userClient.rpc("is_admin")).data, false);
  assert.equal((await userClient.rpc("admin_session")).error?.code, "42501");
  assert.equal((await userClient.from("profiles").update({ display_name: "Not allowed" }).eq("id", userId)).error?.code, "42501");
  console.log("Hosted profile isolation, direct-write denial, and admin RPC denial passed.");
  const { data: available, error: availableError } = await userClient.rpc("available_surveys", { p_page: 1 });
  assert.ifError(availableError);
  assert.deepEqual(available, [], "A new signup must not inherit the earlier admin example assignment.");
  const { data: sample, error: sampleError } = await admin.from("survey_assignments").select("id").eq("survey_id", "e2000000-0000-4000-8000-000000000001").limit(1).single();
  assert.ifError(sampleError);
  const hidden = await userClient.rpc("assigned_survey", { p_assignment_id: sample.id });
  assert.ifError(hidden.error);
  assert.equal(hidden.data, null);
  const blocked = await userClient.rpc("submit_survey", { p_assignment_id: sample.id, p_answers: [] });
  assert.equal(blocked.error?.code, "42501");
  console.log("Hosted survey RPCs and cross-user submission denial passed; no hosted rewards or responses were created.");
  const history = await userClient.rpc("participant_history", { p_page: 1 });
  assert.ifError(history.error);
  assert.deepEqual(history.data, { total_points: "0", entries: [] });
  await page.goto(`${origin}/history`);
  await page.getByRole("heading", { name: "History & points", exact: true }).waitFor();
  assert.ok((await page.getByRole("region", { name: "Points balance" }).innerText()).includes("0 points"));
  console.log("Hosted empty history, exact zero balance, and protected history page passed.");
} finally {
  await browser?.close();
  await userClient.auth.signOut();
  if (userId) {
    // Identity-specific cleanup: the fixture never creates surveys, answers, or points.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) throw new Error(`Temporary profile cleanup failed (${profileError.code}); inspect the smoke-test identity.`);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Temporary Auth identity cleanup failed (${error.code ?? error.status}).`);
    console.log("Temporary test identity and empty profile removed.");
  }
}
