import { requireAdmin } from "@/lib/auth/guards";
import { adminSurvey } from "@/lib/data/admin";
import { SurveyBuilder } from "@/components/admin/survey-builder";
export const metadata = { title: "Survey builder" };
export default async function EditSurvey({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  await requireAdmin();
  const { surveyId } = await params;
  return <SurveyBuilder key={surveyId} initial={await adminSurvey(surveyId)} />;
}
