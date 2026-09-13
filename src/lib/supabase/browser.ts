"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Call with the explicit public config DTO; never import the server environment.
export function createClient(config: { url: string; anonKey: string }) {
  return createBrowserClient<Database>(config.url, config.anonKey);
}
