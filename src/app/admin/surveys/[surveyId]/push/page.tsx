import { requireAdmin } from "@/lib/auth/guards";
import { adminSurvey, adminRoster } from "@/lib/data/admin";
import { PushForm } from "@/components/admin/push-form";
export const metadata = { title: "Push survey" };
export default async function PushPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  await requireAdmin();
  const survey = await adminSurvey((await params).surveyId);
  const roster = await adminRoster(1);
  return (
    <>
      <h1 className="text-3xl font-bold">Push survey</h1>
      <p className="mb-7 mt-3 text-sm text-muted">
        {survey.title} · {survey.reward_points} points
      </p>
      <PushForm
        id={survey.id}
        version={survey.definition_version}
        users={roster.rows}
        hasMore={roster.hasMore}
        eligible={
          survey.status === "published" ||
          (survey.status === "draft" &&
            survey.approved_definition_version === survey.definition_version)
        }
      />
    </>
  );
}
