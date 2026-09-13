import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirect } from "../../src/lib/auth/redirect.ts";
import { loginSchema, signupSchema } from "../../src/lib/validation/auth.ts";

test("redirect destinations cannot escape the app or enter auth callback loops", () => {
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/auth/confirm", "/login", "/dashboard\n", "/administrator", null]) {
    assert.equal(safeRedirect(value), "/dashboard");
  }
  assert.equal(safeRedirect("/admin/surveys"), "/admin/surveys");
  assert.equal(safeRedirect("/surveys/123?step=2"), "/surveys/123?step=2");
});

test("signup requires matching bounded passwords; login preserves existing shorter passwords", () => {
  assert.equal(signupSchema.safeParse({ email: "user@example.com", password: "short", confirmPassword: "short" }).success, false);
  assert.equal(signupSchema.safeParse({ email: "user@example.com", password: "long-enough-password", confirmPassword: "does-not-match" }).success, false);
  assert.equal(signupSchema.safeParse({ email: "bad", password: "long-enough-password", confirmPassword: "long-enough-password" }).success, false);
  assert.equal(signupSchema.safeParse({ email: "user@example.com", password: "long-enough-password", confirmPassword: "long-enough-password" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "user@example.com", password: "short" }).success, true);
});
