import { requireAdmin } from "@/lib/auth/guards";
import { SurveyBuilder } from "@/components/admin/survey-builder";
export const metadata = { title: "Create survey" };
export default async function NewSurvey() {
  await requireAdmin();
  return <SurveyBuilder />;
}
