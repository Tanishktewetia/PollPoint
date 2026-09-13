import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth/guards";
import { assignedSurvey } from "@/lib/data/surveys";
import { SurveyRunner } from "@/components/survey/survey-runner";

export const metadata = { title: "Take a survey" };
export default async function SurveyPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  await requireParticipant(`/surveys/${assignmentId}`);
  const survey = await assignedSurvey(assignmentId);
  if (survey.receipt) redirect(`/surveys/${assignmentId}/complete`);
  return <SurveyRunner survey={survey} />;
}
