import Link from "next/link";
import { Plus, FileUp, ArrowRight } from "lucide-react";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { pageNumber } from "@/lib/data/admin";
import { Pagination } from "@/components/admin/pagination";
export const metadata = { title: "Admin surveys" };
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const page = pageNumber((await searchParams).page);
  const c = await createClient();
  const { data, error } = await c.rpc("admin_survey_list", { p_page: page });
  if (error) throw new Error("Could not load surveys.");
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        status: z.string(),
        reward_points: z.number(),
        authoring_source: z.string(),
      }),
    )
    .parse(data);
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow mb-2 text-brand">Administration</p>
          <h1 className="text-3xl font-extrabold">Your admin workspace.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Create a survey, review its questions, then choose who receives it.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3">
          <Link className="primary-button" href="/admin/surveys/new">
            <Plus size={20} aria-hidden="true" />
            Create survey
          </Link>
          <Link className="secondary-button" href="/admin/surveys/import">
            <FileUp size={18} aria-hidden="true" />
            Draft from document
          </Link>
        </div>
      </div>
      <h2 className="mb-4 text-lg font-bold">Manage your surveys</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.slice(0, 20).map((s) => (
          <Link
            key={s.id}
            href={`/admin/surveys/${s.id}`}
            className="survey-card rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-brand/40"
          >
            <p className="mb-3 text-xs font-semibold uppercase text-brand">
              {s.status.replaceAll("_", " ")} ·{" "}
              {s.authoring_source === "gemini"
                ? "Gemini draft"
                : "Manual survey"}
            </p>
            <h3 className="text-lg font-bold">{s.title}</h3>
            <p className="mt-3 text-sm text-muted">
              {s.reward_points} points per completion
            </p>
            <span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand underline underline-offset-4">
              {s.status === "needs_review"
                ? "Review draft"
                : s.status === "published"
                  ? "Manage survey"
                  : "Open survey"}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      {!rows.length && (
        <p className="rounded-2xl bg-white p-8">
          No surveys yet. Create a survey or upload a requirement document.
        </p>
      )}
      <Pagination base="/admin" page={page} hasMore={rows.length > 20} />
    </>
  );
}
