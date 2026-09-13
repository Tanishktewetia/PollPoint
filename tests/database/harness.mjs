import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

// Real PostgreSQL in WASM, with only Supabase's external Auth schema/roles shimmed.
// This does not replace a hosted Supabase integration check.
export async function createDatabase() {
  const db = new PGlite();
  await initializeDatabase(db);
  return db;
}

export async function initializeDatabase(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  for (const file of (
    await readdir(new URL("../../supabase/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
}

export async function asRole(db, role, userId, work) {
  if (!["anon", "authenticated", "service_role"].includes(role))
    throw new Error("Invalid test role");
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    const result = await work(db);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
