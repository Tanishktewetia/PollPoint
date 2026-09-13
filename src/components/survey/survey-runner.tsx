"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import {
  answerError,
  answerLabel,
  type Answer,
  type Survey,
} from "@/lib/survey/schema";
import { submitSurvey } from "@/app/actions/surveys";
import { QuestionField } from "./question-field";

export function SurveyRunner({ survey }: { survey: Survey }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer | undefined>>(
    {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewStep = survey.questions.length;
  const current = survey.questions[step];
  const questions = current ? [current] : [];
  const blocked = survey.questions.slice(0, step < reviewStep ? step + 1 : reviewStep)
    .some((q) => answerError(q, answers[q.id]));
  const answered = survey.questions.filter(
    (q) => answers[q.id] && !answerError(q, answers[q.id]),
  ).length;
  const dirty = Object.values(answers).some(Boolean);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function goTo(next: number) {
    if (next > step && !validate(next)) return;
    setStep(next);
    setErrors({});
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ behavior: "instant", block: "start" });
    });
  }
  function validate(until = reviewStep) {
    const invalid: Record<string, string> = {};
    survey.questions.slice(0, until).forEach((q) => {
      const error = answerError(q, answers[q.id]);
      if (error) invalid[q.id] = error;
    });
    setErrors(invalid);
    const first = survey.questions.findIndex((q) => invalid[q.id]);
    if (first >= 0) {
      setStep(first);
      requestAnimationFrame(() =>
        document.getElementById(`question-${survey.questions[first].id}`)?.focus(),
      );
      return false;
    }
    return true;
  }
  function submit() {
    if (!validate()) return;
    setSubmitError("");
    startTransition(async () => {
      try {
        const result = await submitSurvey({
          assignmentId: survey.id,
          answers: survey.questions
            .filter((q) => answers[q.id])
            .map((q) => ({ question_id: q.id, answer: answers[q.id] })),
        });
        setSubmitError(result.error);
      } catch (error) {
        // Next uses a redirect error for successful server-action navigation.
        if (
          error instanceof Error &&
          "digest" in error &&
          String(error.digest).startsWith("NEXT_REDIRECT")
        )
          throw error;
        setSubmitError(
          "We couldn’t reach the server. Your answers are still here. Try again—you’ll only earn points once.",
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        onClick={(e) => {
          if (
            dirty &&
            !window.confirm(
              "Leave this survey? Your unsubmitted answers will be lost.",
            )
          )
            e.preventDefault();
        }}
        className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-brand"
      >
        <ArrowLeft size={16} />
        Back to surveys
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-3 text-brand">Your perspective matters</p>
          <h1 className="text-3xl font-bold tracking-tight">{survey.title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            {survey.description}
          </p>
        </div>
        <span className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-brand">
          {survey.reward_points} points
        </span>
      </div>
      <div className="mb-7">
        <div className="mb-3 flex justify-between text-xs font-semibold text-muted">
          <span>
            Step {step + 1} of {reviewStep + 1} ·{" "}
            {current ? (current.section === "demographics" ? "About you" : "Your perspective") : "Review"}
          </span>
          <span>
            {answered} of {survey.questions.length} answered
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Survey steps"
          aria-valuenow={step + 1}
          aria-valuemin={0}
          aria-valuemax={reviewStep + 1}
          className="h-2 overflow-hidden rounded-full bg-stone-200"
        >
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${((step + 1) / (reviewStep + 1)) * 100}%` }}
          />
        </div>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (step === reviewStep) submit();
          else goTo(step + 1);
        }}
        className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-9"
      >
        <h2
          ref={heading}
          tabIndex={-1}
          className="mb-3 scroll-mt-8 text-xl font-bold"
        >
          {current ? (current.section === "demographics" ? "First, a little about you." : "Your perspective") : "Ready to make it count?"}
        </h2>
        <p className="mb-8 text-sm leading-6 text-muted">
          {current?.section === "demographics"
            ? "These answers apply to this survey only. Choose “Prefer not to say” whenever you’d rather not share."
            : current
              ? "There’s room for your honest opinion. Answer each required question to continue."
              : "Check your answers below. Once submitted, your response is final and your points are awarded automatically."}
        </p>
        {step < reviewStep ? (
          <div className="space-y-9">
            {questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                answer={answers[q.id]}
                error={errors[q.id] ?? (answers[q.id] ? answerError(q, answers[q.id]) ?? undefined : undefined)}
                disabled={pending}
                onChange={(value) => {
                  setAnswers((old) => ({ ...old, [q.id]: value }));
                  setErrors((old) => {
                    const next = { ...old };
                    delete next[q.id];
                    return next;
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {["demographics", "body"].map((section) => (
              <section key={section}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-bold">
                    {section === "demographics"
                      ? "About you"
                      : "Your perspective"}
                  </h3>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => goTo(survey.questions.findIndex((q) => q.section === section))}
                    className="text-sm font-semibold text-brand underline"
                  >
                    Edit answers
                  </button>
                </div>
                <dl className="divide-y divide-stone-100">
                  {survey.questions
                    .filter((q) => q.section === section)
                    .map((q) => (
                      <div key={q.id} className="py-3">
                        <dt className="text-sm text-muted">{q.prompt}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
                          {answerLabel(q, answers[q.id])}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </div>
        )}
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="mt-6 text-sm font-semibold text-red-700">
            Please check the highlighted questions.
          </p>
        )}
        {submitError && (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {submitError}
          </p>
        )}
        <p className="mt-8 flex items-start gap-2 border-t border-stone-100 pt-5 text-xs leading-5 text-muted">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand" />
          Your answers are linked to your account and can be reviewed by
          authorized PollPoint admins. Unsubmitted answers stay in this page and
          aren’t saved.
        </p>
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          {step > 0 ? (
            <button
              disabled={pending}
              type="button"
              className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-semibold"
              onClick={() => goTo(step - 1)}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={pending || blocked} className="primary-button">
            {pending ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                Submitting…
              </>
            ) : step === reviewStep ? (
              <>
                <Check size={18} />
                Submit & earn {survey.reward_points} points
              </>
            ) : (
              <>
                Next
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
