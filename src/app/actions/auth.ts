"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/config";
import { safeRedirect } from "@/lib/auth/redirect";
import { loginSchema, signupSchema, type AuthState } from "@/lib/validation/auth";

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirm your email using the link in your inbox before signing in." };
    if (error.status === 429) return { error: "Too many attempts. Please wait a moment and try again." };
    return { error: "We couldn’t sign you in. Check your email and password, then try again." };
  }
  revalidatePath("/", "layout");
  redirect(safeRedirect(formData.get("next")));
}

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${getSiteUrl()}/auth/confirm` },
  });
  if (error) {
    if (error.status === 429) return { error: "Too many signup attempts. Please wait before trying again." };
    return { error: "We couldn’t create your account. Please try again, or sign in if you already have one." };
  }
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }
  return { success: "Check your inbox. If this address is eligible, you’ll receive a link to confirm your email. Already registered? Sign in instead." };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("We couldn’t sign you out. Please try again.");
  revalidatePath("/", "layout");
  redirect("/login");
}
