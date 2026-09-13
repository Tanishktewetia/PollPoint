import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getUser, getAdminStatus } from "@/lib/auth/guards";
import { safeRedirect } from "@/lib/auth/redirect";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeRedirect(params.next);
  if (await getUser()) redirect(await getAdminStatus() ? "/admin" : next);
  return <><p className="eyebrow mb-4 text-brand">Make your voice count</p><h2 className="text-3xl font-bold tracking-tight">Welcome back.</h2><p className="mb-8 mt-3 text-sm leading-6 text-muted">Sign in and pick up where you left off.</p><AuthForm mode="login" next={next} confirmationError={params.error === "confirmation"} /></>;
}
