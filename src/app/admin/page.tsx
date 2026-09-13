import Link from "next/link";
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
      <p className="eyebrow mb-3 text-brand">Administration</p>
      <h1 className="text-3xl font-bold">Your admin workspace.</h1>
      <div className="my-7 flex flex-wrap gap-4">
        <Link className="primary-button" href="/admin/surveys/new">
          Create survey
        </Link>
        <Link className="secondary-button" href="/admin/surveys/import">
          Draft from document
        </Link>
        <Link className="secondary-button" href="/admin/users">
          User roster
        </Link>
      </div>
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
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="mt-3 text-sm text-muted">
              {s.reward_points} points per completion
            </p>
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
