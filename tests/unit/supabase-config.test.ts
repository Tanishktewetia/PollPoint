import { test } from "node:test";
import assert from "node:assert/strict";
import { getSupabaseConfig } from "../../src/lib/supabase/config.ts";

test("Supabase config identifies missing, empty and invalid variables without disclosing values", (t) => {
  const names = [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_ANON_KEY",
  ];
  const original = names.map((name) => process.env[name]);
  t.after(() =>
    names.forEach((name, index) => {
      if (original[index] === undefined) delete process.env[name];
      else process.env[name] = original[index];
    }),
  );
  names.forEach((name) => delete process.env[name]);
  assert.throws(
    getSupabaseConfig,
    /NEXT_PUBLIC_SUPABASE_URL: missing; SUPABASE_ANON_KEY: missing/,
  );

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "";
  assert.throws(getSupabaseConfig, /SUPABASE_ANON_KEY: empty/);

  const secret = "test-anon-value-never-logged";
  process.env.SUPABASE_ANON_KEY = secret;
  assert.deepEqual(getSupabaseConfig(), {
    url: "https://example.supabase.co",
    anonKey: secret,
  });

  process.env.SUPABASE_URL = "";
  assert.throws(getSupabaseConfig, /SUPABASE_URL: empty/);
  const invalidUrl = "private-value-not-a-url";
  process.env.SUPABASE_URL = invalidUrl;
  assert.throws(getSupabaseConfig, (error: Error) => {
    assert.match(error.message, /SUPABASE_URL: invalid URL/);
    assert.ok(!error.message.includes(secret));
    assert.ok(!error.message.includes(invalidUrl));
    assert.ok(!error.message.includes("example.supabase.co"));
    return true;
  });

  delete process.env.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = invalidUrl;
  assert.throws(getSupabaseConfig, /NEXT_PUBLIC_SUPABASE_URL: invalid URL/);
});
