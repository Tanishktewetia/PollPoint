import { auditScreen } from "../integration/visual-qa.mjs";
import { test, expect } from "@playwright/test";

test("signed-out users are redirected from protected user and admin pages", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
});

test("signup validates password confirmation without contacting Auth", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill("test@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("long-enough-password");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Passwords do not match." }),
  ).toBeVisible();
});

test("invalid confirmation links fail safely without following external redirects", async ({
  page,
}) => {
  await page.goto("/auth/confirm?next=https://evil.example");
  await expect(page).toHaveURL(/\/login\?error=confirmation/);
  await expect(
    page.getByRole("alert").filter({ hasText: "invalid or has expired" }),
  ).toBeVisible();
});

test("auth screens fit mobile and desktop viewports and expose labeled inputs", async ({
  page,
}) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("document import rejects foreign origins and anonymous requests before parsing", async ({
  request,
}) => {
  const foreign = await request.post("/api/admin/survey-imports", {
    headers: { Origin: "https://untrusted.example" },
    data: "not a document",
  });
  expect(foreign.status()).toBe(403);
  const anonymous = await request.post("/api/admin/survey-imports", {
    headers: { Origin: "http://localhost:3000" },
    data: "not a document",
  });
  expect(anonymous.status()).toBe(401);
});

test("auth screens pass accessibility, keyboard and reduced-motion checks", async ({
  page,
}) => {
  for (const route of ["login", "signup"]) {
    await page.goto(`/${route}`);
    await auditScreen(page, route);
    await page.getByLabel("Email address").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .getByRole("button", { name: "Create account" })
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
});
