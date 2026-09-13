"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";
import {
  adminSurveySchema,
  newDefinition,
  newQuestion,
  type Definition,
  type AuthoringQuestion,
} from "@/lib/survey/authoring";
import {
  saveSurvey,
  approveSurvey,
  copySurvey,
  archiveSurvey,
} from "@/app/actions/admin";
import { QuestionField } from "@/components/survey/question-field";
type Survey = z.infer<typeof adminSurveySchema>;
const formats = [
  "short_text",
  "long_text",
  "radio_cards",
  "dropdown",
  "checkbox_cards",
  "number_input",
] as const;
const names = {
  short_text: "Short text",
  long_text: "Long text",
  radio_cards: "Single choice",
  dropdown: "Dropdown",
  checkbox_cards: "Multiple choice",
  number_input: "Whole number",
};
export function SurveyBuilder({ initial }: { initial?: Survey }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Definition>(
    initial
      ? {
          title: initial.title,
          description: initial.description,
          reward_points: initial.reward_points,
          questions: initial.questions,
        }
      : newDefinition(),
  );
  const [dirty, setDirty] = useState(!initial),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const readOnly =
    saved?.status === "published" || saved?.status === "archived";
  const approved =
    !!saved && saved.approved_definition_version === saved.definition_version;
  const workflow = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (pending || !focusNext.current) return;
    focusNext.current = false;
    workflow.current
      ?.querySelector<HTMLElement>(".primary-button")
      ?.focus({ preventScroll: true });
  }, [pending, saved]);
  function change(next: Definition) {
    setDraft(next);
    setDirty(true);
    setError("");
  }
  function question(index: number, value: AuthoringQuestion) {
    change({
      ...draft,
      questions: draft.questions.map((q, i) => (i === index ? value : q)),
    });
  }
  function format(index: number, presentation: (typeof formats)[number]) {
    const old = draft.questions[index];
    let q: AuthoringQuestion;
    const common = {
      field_key: old.field_key,
      section: old.section,
      prompt: old.prompt,
      required: old.required,
    };
    if (presentation === "short_text" || presentation === "long_text")
      q = {
        ...common,
        type: "text",
        presentation,
        config: {
          version: 1,
          min: old.required ? 1 : 0,
          max: presentation === "short_text" ? 120 : 1000,
        },
      };
    else if (presentation === "number_input")
      q = {
        ...common,
        type: "integer",
        presentation,
        config: { version: 1, min: 0, max: 100 },
      };
    else {
      const options =
        "options" in old.config
          ? old.config.options
          : [
              { id: "option_1", label: "Option 1" },
              { id: "option_2", label: "Option 2" },
            ];
      q =
        presentation === "checkbox_cards"
          ? {
              ...common,
              type: "multi_choice",
              presentation,
              config: { version: 1, options, min: 1, max: options.length },
            }
          : {
              ...common,
              type: "single_choice",
              presentation,
              config: { version: 1, options },
            };
    }
    question(index, q);
  }
  function run(work: () => Promise<void>) {
    setError("");
    start(async () => {
      try {
        await work();
      } catch {
        setError(
          "The request could not be completed. Your draft is still here; try again.",
        );
      }
    });
  }
  function accept(s: Survey) {
    focusNext.current = true;
    setSaved(s);
    setDraft({
      title: s.title,
      description: s.description,
      reward_points: s.reward_points,
      questions: s.questions,
    });
    setDirty(false);
  }
  return (
    <div className="space-y-7">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-brand">
          Back to surveys
        </Link>
        <h1 className="mt-4 text-3xl font-bold">
          {saved ? "Survey builder" : "Create a survey"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {saved?.status === "needs_review"
            ? "Gemini draft: review every question before approving."
            : readOnly
              ? "Published content is frozen. Copy this survey to create a revision."
              : "Save your edits, approve the survey, then choose who receives it."}
        </p>
      </div>
      {saved && (
        <p className="text-sm font-semibold text-brand">
          {saved.status.replaceAll("_", " ")} ·{" "}
          {saved.approved_definition_version === saved.definition_version
            ? "Approved"
            : "Review required"}
        </p>
      )}
      {saved && (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-stone-200 pb-5"
          role="group"
          aria-label="Survey management"
        >
          {saved && (
            <>
              <button
                disabled={pending}
                className={
                  saved.status === "archived"
                    ? "primary-button"
                    : "secondary-button"
                }
                onClick={() =>
                  run(async () => {
                    const result = await copySurvey(saved.id);
                    if (result.error) setError(result.error);
                    else if (result.survey)
                      router.push(`/admin/surveys/${result.survey.id}`);
                  })
                }
              >
                Copy survey
              </button>
              <Link
                className="secondary-button"
                href={`/admin/surveys/${saved.id}/responses`}
              >
                View responses
              </Link>
            </>
          )}
          {saved?.status === "published" && (
            <button
              disabled={pending}
              className="text-button text-red-700 sm:ml-auto"
              onClick={() => {
                if (
                  window.confirm(
                    "Archive this survey? Unfinished participants will no longer be able to submit.",
                  )
                )
                  run(async () => {
                    const result = await archiveSurvey(saved.id);
                    if (result.error) setError(result.error);
                    else {
                      setSaved({ ...saved, status: "archived" });
                      router.refresh();
                    }
                  });
              }}
            >
              Archive
            </button>
          )}
        </div>
      )}
      <fieldset
        disabled={pending || readOnly}
        className="space-y-6 rounded-3xl border border-stone-200 bg-white p-6"
      >
        <label className="block text-sm font-semibold">
          Survey title
          <input
            className="input-field"
            maxLength={160}
            value={draft.title}
            onChange={(e) => change({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="block text-sm font-semibold">
          Description
          <textarea
            className="input-field"
            maxLength={4000}
            value={draft.description}
            onChange={(e) => change({ ...draft, description: e.target.value })}
          />
        </label>
        <label className="block text-sm font-semibold">
          Points per completion
          <input
            className="input-field max-w-48"
            type="number"
            min={0}
            max={2147483647}
            value={draft.reward_points}
            onChange={(e) =>
              change({ ...draft, reward_points: e.target.valueAsNumber })
            }
          />
        </label>
      </fieldset>
      {draft.questions.map((q, i) => (
        <section
          key={q.field_key}
          className="rounded-3xl border border-stone-200 bg-white p-6"
        >
          <h2 className="mb-4 font-bold">
            Question {i + 1}
            {i < 4 ? " · Required demographic" : ""}
          </h2>
          {readOnly ? (
            <QuestionField
              question={{ ...q, id: q.field_key }}
              disabled
              answer={undefined}
              onChange={() => {}}
            />
          ) : (
            <fieldset disabled={pending} className="space-y-4">
              <label className="block text-sm font-semibold">
                Question text
                <textarea
                  className="input-field"
                  maxLength={2000}
                  value={q.prompt}
                  onChange={(e) =>
                    question(i, { ...q, prompt: e.target.value })
                  }
                />
              </label>
              {i >= 4 && (
                <div className="flex flex-wrap items-center gap-5">
                  <label className="text-sm font-semibold">
                    Answer format
                    <select
                      className="input-field"
                      value={q.presentation}
                      onChange={(e) =>
                        format(i, e.target.value as (typeof formats)[number])
                      }
                    >
                      {formats.map((f) => (
                        <option key={f} value={f}>
                          {names[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) =>
                        question(i, { ...q, required: e.target.checked })
                      }
                    />{" "}
                    Required answer
                  </label>
                </div>
              )}
              {"options" in q.config && (
                <details open={i >= 4}>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Answer options
                  </summary>
                  <label className="mt-3 block text-sm">
                    One answer option per line
                    <textarea
                      className="input-field min-h-32"
                      value={q.config.options.map((o) => o.label).join("\n")}
                      onChange={(e) => {
                        if (!("options" in q.config)) return;
                        const old = q.config.options;
                        const options = e.target.value
                          .split("\n")
                          .map((label, n) => ({
                            id:
                              old[n]?.id ??
                              `option_${crypto.randomUUID().replaceAll("-", "")}`,
                            label,
                          }));
                        question(i, {
                          ...q,
                          config: { ...q.config, options },
                        } as AuthoringQuestion);
                      }}
                    />
                  </label>
                </details>
              )}
              {"min" in q.config && (
                <div className="flex gap-4">
                  {(["min", "max"] as const).map((bound) => (
                    <label key={bound} className="block text-sm">
                      {bound === "min" ? "Minimum" : "Maximum"}
                      <input
                        className="input-field max-w-40"
                        type="number"
                        value={"min" in q.config ? q.config[bound] : 0}
                        onChange={(e) =>
                          question(i, {
                            ...q,
                            config: {
                              ...q.config,
                              [bound]: e.target.valueAsNumber,
                            },
                          } as AuthoringQuestion)
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              {q.type === "multi_choice" && (
                <label className="block text-sm">
                  Option that must be selected alone
                  <select
                    className="input-field"
                    value={q.config.exclusive_option_ids?.[0] ?? ""}
                    onChange={(e) =>
                      question(i, {
                        ...q,
                        config: {
                          ...q.config,
                          exclusive_option_ids: e.target.value
                            ? [e.target.value]
                            : [],
                        },
                      })
                    }
                  >
                    <option value="">None</option>
                    {q.config.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {q.type === "integer" && i >= 4 && (
                <label className="block text-sm">
                  <input
                    type="checkbox"
                    checked={q.config.allow_decline ?? false}
                    onChange={(e) =>
                      question(i, {
                        ...q,
                        config: {
                          ...q.config,
                          allow_decline: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  Allow “Prefer not to say”
                </label>
              )}
              {q.type === "single_choice" && i >= 4 && (
                <label className="block text-sm">
                  Attention-check answer (optional, private)
                  <select
                    className="input-field"
                    value={q.check?.expected_option_id ?? ""}
                    onChange={(e) => {
                      const next = { ...q };
                      if (e.target.value)
                        next.check = {
                          version: 1,
                          operator: "equals_option",
                          expected_option_id: e.target.value,
                        };
                      else delete next.check;
                      question(i, next);
                    }}
                  >
                    <option value="">No attention check</option>
                    {q.config.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {i >= 4 && (
                <div className="flex gap-4 text-sm font-semibold text-brand">
                  <button
                    type="button"
                    disabled={i === 4}
                    onClick={() => {
                      const questions = [...draft.questions];
                      [questions[i - 1], questions[i]] = [
                        questions[i],
                        questions[i - 1],
                      ];
                      change({ ...draft, questions });
                    }}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={i === draft.questions.length - 1}
                    onClick={() => {
                      const questions = [...draft.questions];
                      [questions[i + 1], questions[i]] = [
                        questions[i],
                        questions[i + 1],
                      ];
                      change({ ...draft, questions });
                    }}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={draft.questions.length === 5}
                    onClick={() =>
                      change({
                        ...draft,
                        questions: draft.questions.filter((_, n) => n !== i),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </fieldset>
          )}
        </section>
      ))}
      {!readOnly && (
        <button
          className="secondary-button w-full border-dashed"
          disabled={pending || draft.questions.length >= 100}
          onClick={() =>
            change({
              ...draft,
              questions: [
                ...draft.questions,
                {
                  ...newQuestion(draft.questions.length),
                  field_key: `q_${crypto.randomUUID().replaceAll("-", "")}`,
                },
              ],
            })
          }
        >
          Add question
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {saved?.status !== "archived" && (
        <div
          ref={workflow}
          className="action-dock"
          role="region"
          aria-label="Survey workflow"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {dirty
                ? "1. Save your draft"
                : !approved && !readOnly
                  ? "2. Review and approve"
                  : "3. Choose your audience"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {dirty
                ? "Unsaved edits · save before approval"
                : !approved && !readOnly
                  ? "Check every question before approving."
                  : "Ready to push. Choose recipients on the next page."}
            </p>
          </div>
          {!readOnly && (dirty || !approved) && (
            <>
              {dirty ? (
                <button
                  className="primary-button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await saveSurvey(
                        saved?.id ?? null,
                        saved?.definition_version ?? null,
                        draft,
                      );
                      if (result.error) setError(result.error);
                      else if (result.survey) {
                        accept(result.survey);
                        if (!saved)
                          router.replace(`/admin/surveys/${result.survey.id}`);
                      }
                    })
                  }
                >
                  {pending ? "Working…" : "Save draft"}
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={
                    pending ||
                    dirty ||
                    !saved ||
                    saved.approved_definition_version ===
                      saved.definition_version
                  }
                  onClick={() =>
                    run(async () => {
                      if (!saved) return;
                      const result = await approveSurvey(
                        saved.id,
                        saved.definition_version,
                      );
                      if (result.error) setError(result.error);
                      else if (result.survey) accept(result.survey);
                    })
                  }
                >
                  {pending ? "Working…" : "Approve survey"}
                </button>
              )}
            </>
          )}
          {saved &&
            !dirty &&
            (saved.status === "published" ||
              saved.approved_definition_version ===
                saved.definition_version) && (
              <Link
                className="primary-button"
                href={`/admin/surveys/${saved.id}/push`}
              >
                Push survey
              </Link>
            )}
        </div>
      )}
    </div>
  );
}
