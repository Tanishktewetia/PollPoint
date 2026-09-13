// Test-only Supabase HTTP adapter: real Next.js + real PostgreSQL, no hosted writes.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { startPostgres } from "./postgres.mjs";
import { seedExample, assignUser } from "../database/fixtures.mjs";

const cluster = await startPostgres();
let server, app, browser;
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
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_ANON_KEY: "local-test-anon",
        NEXT_PUBLIC_SITE_URL: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let appErrors = "";
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
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${origin}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Everyday life, your way" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Take survey" }).click();
  await expect(
    page.getByRole("heading", { name: "First, a little about you." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "highlighted" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Prefer not to say", exact: true })
    .check();
  await page
    .getByRole("combobox", {
      name: "What is your personal monthly income (INR)?",
    })
    .selectOption("prefer_not_to_say");
  await page.getByRole("radio", { name: "Single", exact: true }).check();
  await page
    .getByRole("combobox", { name: "Which country do you live in?" })
    .selectOption("IN");
  await mkdir("test-results/phase-2", { recursive: true });
  await page.screenshot({
    path: "test-results/phase-2/demographics-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("radio", { name: "Less than an hour", exact: true })
    .check();
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
  await page
    .getByRole("combobox", { name: "How often do you shop online?" })
    .selectOption("weekly");
  await page.getByRole("radio", { name: "Agree", exact: true }).check();
  await page
    .getByRole("textbox", {
      name: "What is one accessory you use almost every day?",
    })
    .fill("Wireless earbuds");
  await page.getByRole("radio", { name: "Red", exact: true }).check();
  await page
    .getByRole("textbox", {
      name: "What would make your online shopping experience better?",
    })
    .fill("Clearer sizing information.");
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
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to make it count?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "What is one accessory you use almost every day?",
    }),
  ).toHaveValue("Wireless earbuds");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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
  console.log(
    "Survey browser integration passed: required answers, all formats, review/back, retry, full reward despite failed check, one credit, completed redirect, and cross-user denial.",
  );
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
