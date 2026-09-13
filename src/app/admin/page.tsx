import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  return <><p className="eyebrow mb-3 text-brand">Administration</p><h1 className="text-3xl font-bold tracking-tight">Your admin workspace.</h1><section className="mt-8 rounded-3xl border border-stone-200 bg-white p-8"><ShieldCheck size={32} className="mb-5 text-brand" aria-hidden="true" /><h2 className="text-xl font-bold">Admin access verified</h2><p className="mt-3 max-w-lg text-sm leading-7 text-muted">Your account has permission to manage PollPoint. Survey authoring, distribution, and response review will be available here soon.</p></section></>;
}
