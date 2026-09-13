import { MessageCircle, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireUser();
  const { notice } = await searchParams;
  return <>{notice === "admin-only" && <p role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This account does not have admin access.</p>}<p className="eyebrow mb-3 text-brand">Your PollPoint space</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">You’re in. Welcome to PollPoint.</h1><p className="mt-4 max-w-xl leading-7 text-muted">Your account is ready. This is where your survey journey begins.</p><section className="mt-9 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-stone-200 bg-white px-6 py-12 text-center"><span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-lime/35 text-brand"><MessageCircle size={26} aria-hidden="true" /></span><h2 className="text-xl font-bold">A new perspective is on its way.</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted">Survey participation is coming soon. Your sign-in and account access are ready.</p></section><div className="mt-6 flex items-center gap-2 text-xs text-muted"><ShieldCheck size={16} className="text-brand" aria-hidden="true" />Your account and access are protected.</div></>;
}
