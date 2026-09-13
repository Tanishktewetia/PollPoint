import { z } from "zod";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { adminSurvey, pageNumber } from "@/lib/data/admin";
import { createClient } from "@/lib/supabase/server";
import { Pagination } from "@/components/admin/pagination";
import { questionSchema, answerSchema, answerLabel } from "@/lib/survey/schema";
export const metadata = { title: "Survey responses" };
export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const survey = await adminSurvey((await params).surveyId);
  const page = pageNumber((await searchParams).page);
  const c = await createClient();
  const { data, error } = await c.rpc("admin_responses", {
    p_id: survey.id,
    p_page: page,
  });
  if (error) throw new Error("Could not load responses.");
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        display_name: z.string().nullable(),
        email: z.string().nullable(),
        submitted_at: z.string(),
        points: z.number(),
        answers: z.array(
          z.object({ question: questionSchema, answer: answerSchema }),
        ),
        flags: z.array(z.object({ question_id: z.uuid(), reason: z.string() })),
      }),
    )
    .parse(data);
  return (
    <>
      <Link href={`/admin/surveys/${survey.id}`} className="text-button mb-4">
        Back to survey
      </Link>
      <h1 className="text-3xl font-bold">Survey responses</h1>
      <p className="mb-7 mt-3 text-sm text-muted">
        {survey.title} · Private admin review
      </p>
      <div className="space-y-5">
        {rows.slice(0, 20).map((r) => (
          <details
            key={r.id}
            className="rounded-2xl border border-stone-200 bg-white p-6"
          >
            <summary className="cursor-pointer font-semibold">
              {r.display_name || r.email || "Participant"} · {r.points} points
              {r.flags.length ? ` · ${r.flags.length} attention flag(s)` : ""}
            </summary>
            <p className="mt-3 text-xs text-muted">
              {r.email} ·{" "}
              {new Date(r.submitted_at).toLocaleString("en-IN", {
                timeZone: "UTC",
              })}{" "}
              UTC
            </p>
            <dl>
              {r.answers.map((a) => (
                <div key={a.question.id} className="mt-5">
                  <dt className="text-sm text-muted">
                    {a.question.prompt}
                    {r.flags.some((f) => f.question_id === a.question.id)
                      ? " · Attention check failed"
                      : ""}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {answerLabel(a.question, a.answer)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
      {!rows.length && <p>No responses on this page.</p>}
      <Pagination
        base={`/admin/surveys/${survey.id}/responses`}
        page={page}
        hasMore={rows.length > 20}
      />
    </>
  );
}
