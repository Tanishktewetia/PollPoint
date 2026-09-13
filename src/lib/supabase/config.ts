import "server-only";
import { z } from "zod";

const schema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

export function getSupabaseConfig() {
  const overrideUrl = process.env.SUPABASE_URL;
  const urlName =
    overrideUrl !== undefined ? "SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_URL";
  const url = overrideUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const result = schema.safeParse({
    url,
    anonKey,
  });
  if (!result.success) {
    // Report only fixed labels/reasons, never values or Zod's input details.
    const failures = result.error.issues.map((issue) => {
      const isUrl = issue.path[0] === "url";
      const name = isUrl ? urlName : "SUPABASE_ANON_KEY";
      const value = isUrl ? url : anonKey;
      const reason =
        value === undefined
          ? "missing"
          : value === ""
            ? "empty"
            : "invalid URL";
      return `${name}: ${reason}`;
    });
    throw new Error(
      `Invalid Supabase server configuration (${failures.join("; ")}). Check this deployment's Production environment variables and redeploy.`,
    );
  }
  return result.data;
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Set NEXT_PUBLIC_SITE_URL to the production application URL.",
    );
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
