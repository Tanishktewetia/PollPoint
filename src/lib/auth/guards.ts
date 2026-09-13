import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "./redirect";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) {
    throw new Error("Authentication is temporarily unavailable. Please try again.");
  }
  return data.user;
});

export async function requireUser(next = "/dashboard") {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeRedirect(next))}`);
  return user;
}

export const getAdminStatus = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error("Account access could not be verified. Please try again.");
  return data === true;
});

export async function requireAdmin() {
  const user = await requireUser("/admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_session");
  if (error?.code === "42501") redirect("/dashboard?notice=admin-only");
  if (error || data !== true) throw new Error("Admin access could not be verified. Please try again.");
  return user;
}
