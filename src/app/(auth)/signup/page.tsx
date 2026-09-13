import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getUser, getAdminStatus } from "@/lib/auth/guards";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getUser()) redirect(await getAdminStatus() ? "/admin" : "/dashboard");
  return <><p className="eyebrow mb-4 text-brand">Your perspective belongs here</p><h2 className="text-3xl font-bold tracking-tight">Let’s get you started.</h2><p className="mb-8 mt-3 text-sm leading-6 text-muted">Create your account to start your PollPoint journey.</p><AuthForm mode="signup" /></>;
}
