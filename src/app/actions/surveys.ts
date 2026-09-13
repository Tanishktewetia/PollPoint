"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireParticipant } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { submissionSchema, receiptSchema } from "@/lib/survey/schema";

export async function submitSurvey(
  payload: unknown,
): Promise<{ error: string }> {
  await requireParticipant();
  const parsed = submissionSchema.safeParse(payload);
  if (
    !parsed.success ||
    Buffer.byteLength(JSON.stringify(parsed.data)) > 65536
  ) {
    return {
      error: "Your answers could not be submitted. Review them and try again.",
    };
  }
  const client = await createClient();
  const { data, error } = await client.rpc("submit_survey", {
    p_assignment_id: parsed.data.assignmentId,
    p_answers: parsed.data.answers,
  });
  if (error) {
    if (error.code === "42501" || error.code === "P0002")
      return {
        error:
          "This survey is no longer available. Return to your dashboard to see current surveys.",
      };
    if (error.code === "22023")
      return {
        error:
          "Some answers need attention. Review the questions and try again.",
      };
    return {
      error:
        "We couldn’t confirm your submission. Your answers are still here—please try again. You’ll only be credited once.",
    };
  }
  if (!receiptSchema.safeParse(data).success)
    return {
      error:
        "We couldn’t confirm your receipt. Please try again; you’ll only be credited once.",
    };
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath(`/surveys/${parsed.data.assignmentId}`);
  redirect(`/surveys/${parsed.data.assignmentId}/complete`);
}
