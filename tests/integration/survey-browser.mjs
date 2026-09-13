// Test-only Supabase HTTP adapter: real Next.js + real PostgreSQL, no hosted writes.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { auditScreen } from "./visual-qa.mjs";
import { docx, pdf } from "./document-fixtures.mjs";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { startPostgres } from "./postgres.mjs";
import {
  seedExample,
  assignUser,
  completeHistory,
} from "../database/fixtures.mjs";

const cluster = await startPostgres();
let server, app, browser, page;
let appErrors = "";
const origin = "http://localhost:3001";
try {
  await seedExample(cluster.db);
  const participant = await assignUser(cluster.db);
  const other = await assignUser(cluster.db);
  const user = {
    id: participant.userId,
    email: "participant@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const encoded = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 })}.local-test-signature`;
  const session = {
    access_token: token,
    refresh_token: "local-test-refresh",
    token_type: "bearer",
    expires_in: 7200,
    expires_at: Math.floor(Date.now() / 1000) + 7200,
    user,
  };
  let failNextSubmission = false;
  const rpcQueries = {
    participant_history: (p) => [
      "select public.participant_history($1) as value",
      [p.p_page],
    ],
    is_admin: () => ["select public.is_admin() as value", []],
    admin_session: () => ["select public.admin_session() as value", []],
    available_surveys: (p) => [
      "select public.available_surveys($1) as value",
      [p.p_page],
    ],
    assigned_survey: (p) => [
      "select public.assigned_survey($1) as value",
      [p.p_assignment_id],
    ],
    submit_survey: (p) => [
      "select public.submit_survey($1,$2) as value",
      [p.p_assignment_id, JSON.stringify(p.p_answers)],
    ],
  };
  const adminRpcArgs = {
    admin_user_roster: ["p_page"],
    admin_survey_list: ["p_page"],
    admin_survey: ["p_id"],
    admin_save_survey: ["p_id", "p_version", "p_definition"],
    admin_approve_survey: ["p_id", "p_version"],
    admin_copy_survey: ["p_id"],
    admin_archive_survey: ["p_id"],
    admin_push_survey: [
      "p_id",
      "p_version",
      "p_audience",
      "p_users",
      "p_request_id",
    ],
    admin_responses: ["p_id", "p_page"],
    admin_begin_import: ["p_request_id", "p_meta"],
    admin_finish_import: ["p_id", "p_lease", "p_definition"],
    admin_fail_import: ["p_id", "p_lease", "p_error"],
    admin_import_status: ["p_id"],
  };
  for (const [name, keys] of Object.entries(adminRpcArgs))
    rpcQueries[name] = (p) => [
      `select public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
      keys.map((key) =>
        ["p_definition", "p_meta"].includes(key)
          ? JSON.stringify(p[key])
          : p[key],
      ),
    ];
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: "No test session", code: "401" }));
      return;
    }
    if (req.url === "/auth/v1/user") {
      res.end(JSON.stringify(user));
      return;
    }
    const name = req.url?.split("/rest/v1/rpc/")[1];
    if (!Object.hasOwn(rpcQueries, name ?? "")) {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    let client;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100000) throw new Error("Too large");
      }
      if (name === "submit_survey" && failNextSubmission) {
        failNextSubmission = false;
        res.writeHead(503);
        res.end(
          JSON.stringify({
            code: "503",
            message: "Injected temporary failure",
          }),
        );
        return;
      }
      const [sql, args] = rpcQueries[name](JSON.parse(body || "{}"));
      client = await cluster.connect();
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user.id,
      ]);
      const result = await client.query(sql, args);
      await client.query("commit");
      res.end(JSON.stringify(result.rows[0].value));
    } catch (error) {
      await client?.query("rollback");
      res.writeHead(400);
      res.end(
        JSON.stringify({ code: error.code ?? "500", message: error.message }),
      );
    } finally {
      await client?.end();
    }
  });
  await new Promise((resolve) => server.listen(54329, "127.0.0.1", resolve));
  app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3001"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=${pathToFileURL(resolve("tests/integration/mock-gemini.mjs")).href}`,
        GEMINI_API_KEY: "isolated-browser-test-key",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_ANON_KEY: "local-test-anon",
        NEXT_PUBLIC_SITE_URL: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  app.stderr.on("data", (chunk) => {
    appErrors += chunk.toString();
  });
  app.stdout.resume();
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null)
      throw new Error(`Test application stopped: ${appErrors}`);
    try {
      await fetch(`${origin}/login`);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!ready) throw new Error("Test application did not start");
  browser = await chromium.launch({
    channel: process.env.CI ? undefined : "msedge",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      domain: "localhost",
      path: "/",
    },
  ]);
  page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${origin}/history`);
  await expect(
    page.getByRole("heading", { name: "Your first completion starts here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Points balance" }),
  ).toContainText("0 points");
  await page.goto(`${origin}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Everyday life, your way" }),
  ).toBeVisible();
  await auditScreen(page, "dashboard");
  await page.getByRole("link", { name: "Take survey" }).click();
  await expect(
    page.getByRole("heading", { name: "First, a little about you." }),
  ).toBeVisible();
  await auditScreen(page, "survey-question");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeDisabled();
  await page.getByRole("spinbutton").press("Enter");
  await expect(page.getByRole("spinbutton")).toBeVisible();
  await page
    .locator("form[novalidate]")
    .evaluate((form) => form.requestSubmit());
  await expect(next).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Prefer not to say", exact: true })
    .check();
  await next.click();
  await page
    .getByRole("combobox", {
      name: "What is your personal monthly income (INR)?",
    })
    .selectOption("prefer_not_to_say");
  await next.click();
  await page.getByRole("radio", { name: "Single", exact: true }).check();
  await next.click();
  await page
    .getByRole("combobox", { name: "Which country do you live in?" })
    .selectOption("IN");
  await next.click();
  await mkdir("test-results/phase-2", { recursive: true });
  await page.screenshot({
    path: "test-results/phase-2/demographics-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("radio", { name: "Less than an hour", exact: true })
    .check();
  await next.click();
  await page
    .getByRole("checkbox", { name: "Wireless earbuds", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "None of these", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Wireless earbuds", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "Wireless earbuds", exact: true })
    .check();
  await next.click();
  await page
    .getByRole("combobox", { name: "How often do you shop online?" })
    .selectOption("weekly");
  await next.click();
  await page.getByRole("radio", { name: "Agree", exact: true }).check();
  await next.click();
  await page
    .getByRole("textbox", {
      name: "What is one accessory you use almost every day?",
    })
    .fill("Wireless earbuds");
  await next.click();
  await page.getByRole("radio", { name: "Red", exact: true }).check();
  await next.click();
  await expect(next).toBeEnabled(); // Optional answer may be omitted.
  await page.getByRole("textbox").fill("   ");
  await expect(next).toBeDisabled();
  await page.getByRole("textbox").fill("");
  await expect(next).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase-2/questions-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to make it count?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit answers" }).first().click();
  await page
    .getByRole("checkbox", { name: "Prefer not to say", exact: true })
    .uncheck();
  await expect(next).toBeDisabled();
  await page
    .locator("form[novalidate]")
    .evaluate((form) => form.requestSubmit());
  await expect(page.getByRole("spinbutton")).toBeVisible();
  await page.getByRole("spinbutton").fill("28");
  for (let i = 0; i < 11; i++) await next.click();
  failNextSubmission = true;
  await page.getByRole("button", { name: "Submit & earn 100 points" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "couldn’t confirm" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit & earn 100 points" }).click();
  await page.waitForURL(
    `${origin}/surveys/${participant.assignmentId}/complete`,
  );
  await expect(page.getByText("+100", { exact: true })).toBeVisible();
  await auditScreen(page, "receipt");
  await page.screenshot({
    path: "test-results/phase-2/receipt-mobile.png",
    fullPage: true,
  });
  const ledger = await cluster.db.query(
    "select count(*)::int as n,sum(amount)::int as points from public.points_ledger where user_id=$1",
    [user.id],
  );
  expect(ledger.rows[0]).toEqual({ n: 1, points: 100 });
  expect(
    (
      await cluster.db.query(
        "select count(*)::int as n from private.response_flags",
      )
    ).rows[0].n,
  ).toBe(1);
  await page.goto(`${origin}/surveys/${participant.assignmentId}`);
  await page.waitForURL(
    `${origin}/surveys/${participant.assignmentId}/complete`,
  );
  await page.getByRole("link", { name: "Back to surveys" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await page.goto(`${origin}/surveys/${other.assignmentId}`);
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
  await page.goto(`${origin}/history`);
  await expect(
    page.getByRole("region", { name: "Points balance" }),
  ).toContainText("100 points");
  await page
    .getByRole("link", { name: "View receipt for Everyday life, your way" })
    .click();
  await page.waitForURL(
    `${origin}/surveys/${participant.assignmentId}/complete`,
  );
  await completeHistory(cluster.db, user.id, 21);
  await page.goto(`${origin}/history`);
  await expect(
    page.getByRole("region", { name: "Points balance" }),
  ).toContainText("240 points");
  await expect(
    page.getByRole("link", { name: /View receipt for/ }),
  ).toHaveCount(20);
  await expect(
    page.getByRole("link", { name: "History & points", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(
    page.getByRole("link", { name: /View receipt for/ }),
  ).toHaveCount(2);
  await expect(page.getByText("+0 points", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Previous page" }).click();
  await expect(
    page.getByRole("link", { name: /View receipt for/ }),
  ).toHaveCount(20);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase-2/history-mobile.png",
    fullPage: true,
  });
  await auditScreen(page, "history");
  await cluster.db.query(
    "insert into private.admin_memberships(user_id) values ($1)",
    [user.id],
  );
  for (const path of [
    "/history",
    "/dashboard",
    `/surveys/${participant.assignmentId}`,
    "/login",
    "/signup",
    "/",
  ]) {
    await page.goto(`${origin}${path}`);
    await page.waitForURL(`${origin}/admin`);
    await expect(
      page.getByRole("link", { name: "Dashboard", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Take survey" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "History & points" }),
    ).toHaveCount(0);
  }
  await cluster.db.query(
    "update auth.users set email='other@example.invalid' where id=$1",
    [other.userId],
  );
  await page.goto(`${origin}/admin/users`);
  await expect(
    page.getByRole("cell", { name: "other@example.invalid" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: user.email })).toHaveCount(0);
  await auditScreen(page, "roster");
  await page.goto(`${origin}/admin`);
  await auditScreen(page, "admin-surveys");
  await page.goto(`${origin}/admin/surveys/new`);
  await auditScreen(page, "builder");
  await expect(
    page
      .getByRole("region", { name: "Survey workflow" })
      .locator(".primary-button"),
  ).toHaveText("Save draft");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByLabel("Survey title", { exact: true }).focus();
  for (let tab = 0; tab < 14; tab++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => {
        const focused = document.activeElement;
        const r = focused.getBoundingClientRect();
        return focused.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
      "sticky navigation and actions must not obscure keyboard focus",
    ).toBe(true);
  }
  await page
    .getByLabel("Survey title", { exact: true })
    .fill("Manual browser survey");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForURL(/\/admin\/surveys\/[0-9a-f-]+$/);
  const manualUrl = page.url();
  await expect(
    page
      .getByRole("region", { name: "Survey workflow" })
      .locator(".primary-button"),
  ).toHaveText("Approve survey");
  await page
    .getByRole("button", { name: "Approve survey", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Push survey", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Survey workflow" })
      .locator(".primary-button"),
  ).toHaveText("Push survey");
  await expect(
    page.getByRole("link", { name: "Push survey", exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Survey title", { exact: true })
    .fill("Reviewed manual survey");
  await expect(
    page.getByRole("link", { name: "Push survey", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve survey", exact: true })
    .click();
  await page.getByRole("link", { name: "Push survey", exact: true }).click();
  await page
    .getByRole("radio", { name: "Selected participants", exact: true })
    .check();
  await page.getByRole("checkbox", { name: /other@example.invalid/ }).check();
  await page.getByRole("button", { name: "Push survey", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 newly assigned" }),
  ).toBeVisible();
  await auditScreen(page, "push-receipt");
  await page.goto(manualUrl);
  await expect(page.getByLabel("Survey title", { exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "View responses" }).click();
  await expect(page.getByText("No responses on this page.")).toBeVisible();
  await page.goto(
    `${origin}/admin/surveys/e2000000-0000-4000-8000-000000000001/responses`,
  );
  await page.locator("summary").first().click();
  await expect(page.getByText(/Attention check failed/)).toBeVisible();
  await auditScreen(page, "response-review");
  for (const [name, mimeType, buffer] of [
    [
      "company.txt",
      "text/plain",
      Buffer.from("Ask customers about reusable bottles."),
    ],
    [
      "company.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docx(),
    ],
    ["company.pdf", "application/pdf", pdf()],
  ]) {
    await page.goto(`${origin}/admin/surveys/import`);
    if (name === "company.txt") await auditScreen(page, "document-import");
    await page
      .getByLabel("Requirement document")
      .setInputFiles({ name, mimeType, buffer });
    await page.getByLabel("Points per completion").fill("30");
    await page.getByRole("button", { name: "Generate draft" }).click();
    await page.waitForURL(/\/admin\/surveys\/[0-9a-f-]+$/, { timeout: 60000 });
    await expect(
      page.getByText("Gemini draft: review every question before approving."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Push survey", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Survey title", { exact: true })
      .fill(`Reviewed ${name}`);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page
      .getByRole("button", { name: "Approve survey", exact: true })
      .click();
    await page.getByRole("link", { name: "Push survey", exact: true }).click();
    await page
      .getByRole("button", { name: "Push survey", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "1 newly assigned" }),
    ).toBeVisible();
  }
  await page.goto(`${origin}/admin/users`);
  await page.screenshot({
    path: "test-results/phase-2/roster-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  console.log(
    "Survey browser integration passed: required answers, all formats, review/back, retry, full reward despite failed check, one credit, completed redirect, cross-user denial, admin builder/approval/push, roster, review flags, and TXT/DOCX/PDF import through the shared workflow.",
  );
} catch (error) {
  if (page) {
    console.error((await page.locator("body").innerText()).slice(-2000));
    await page.screenshot({
      path: "test-results/phase-2/failure.png",
      fullPage: true,
    });
  }
  console.error(appErrors.slice(-3000));
  throw error;
} finally {
  await browser?.close();
  if (app) {
    const exited = new Promise((resolve) => app.once("exit", resolve));
    app.kill();
    await exited;
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await cluster.close();
}
