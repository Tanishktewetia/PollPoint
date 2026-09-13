import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, ArrowRight } from "lucide-react";
import { requireParticipant } from "@/lib/auth/guards";
import { assignedSurvey } from "@/lib/data/surveys";

export const metadata = { title: "Survey complete" };
export default async function CompletionPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  await requireParticipant(`/surveys/${assignmentId}/complete`);
  const survey = await assignedSurvey(assignmentId);
  if (!survey.receipt) redirect(`/surveys/${assignmentId}`);
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-stone-200 bg-white px-7 py-12 text-center">
      <CircleCheck
        size={52}
        className="mx-auto mb-6 text-brand"
        aria-hidden="true"
      />
      <p className="eyebrow mb-4 text-brand">
        Perspective shared. Points earned.
      </p>
      <h1 className="text-3xl font-bold">Thanks for making it count.</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        Your response to “{survey.receipt.title ?? survey.title}” has been
        saved.
      </p>
      <div className="my-8 rounded-2xl bg-lime/35 p-6">
        <p className="text-4xl font-extrabold text-brand">
          +{survey.receipt.points}
        </p>
        <p className="mt-2 text-sm font-semibold text-brand">points earned</p>
      </div>
      <p className="mb-7 text-xs leading-5 text-muted">
        Completed{" "}
        {new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(new Date(survey.receipt.submitted_at))}{" "}
        UTC.
        <br />
        This survey can only be completed once.
      </p>
      <Link href="/dashboard" className="primary-button">
        Back to surveys
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </section>
  );
}
