import "server-only";
import { z } from "zod";

const schema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

export function getSupabaseConfig() {
  const result = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY in the server environment.");
  }
  return result.data;
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Set NEXT_PUBLIC_SITE_URL to the production application URL.");
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
