import { z } from "zod";
import { questionSchema } from "./schema";
import demographics from "./demographics.json";

const check = z
  .object({
    version: z.literal(1),
    operator: z.literal("equals_option"),
    expected_option_id: z.string(),
  })
  .strict();
const fields = {
  field_key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  prompt: z.string().trim().min(1).max(2000),
  check: check.optional(),
};
// Derive authoring from the existing question contract; IDs belong to the server.
export const authoringQuestionSchema = z
  .discriminatedUnion("type", [
    questionSchema.options[0].omit({ id: true }).extend(fields),
    questionSchema.options[1].omit({ id: true }).extend(fields),
    questionSchema.options[2].omit({ id: true }).extend(fields),
    questionSchema.options[3].omit({ id: true }).extend(fields),
  ])
  .superRefine((q, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if ("options" in q.config) {
      const opts = q.config.options;
      if (new Set(opts.map((o) => o.id)).size !== opts.length)
        fail("Option IDs must be unique.");
      for (const o of opts)
        if (
          !/^[A-Za-z0-9_]{1,64}$/.test(o.id) ||
          !o.label.trim() ||
          o.label.length > 160
        )
          fail("Each option needs a valid ID and a label of 1–160 characters.");
    }
    if ("min" in q.config) {
      const { min, max } = q.config;
      if (min > max) fail("Minimum cannot exceed maximum.");
      if (q.type === "text" && (min < 0 || max > 4000))
        fail("Text limits must be within 0–4000.");
      if (q.type === "integer" && (min < -1000000 || max > 1000000))
        fail("Number limits must be within -1000000–1000000.");
    }
    if (q.type === "multi_choice") {
      const c = q.config;
      if (c.min < 0 || c.max < 1 || c.max > c.options.length)
        fail("Selection bounds must fit the options.");
      if (
        c.exclusive_option_ids?.length &&
        (c.min > 1 ||
          c.exclusive_option_ids.some(
            (id) => !c.options.some((o) => o.id === id),
          ))
      )
        fail("Exclusive choices must be valid alone.");
    }
    if (
      q.check &&
      (q.type !== "single_choice" ||
        !q.config.options.some((o) => o.id === q.check?.expected_option_id))
    )
      fail("Attention check must reference a single-choice option.");
  });
export type AuthoringQuestion = z.infer<typeof authoringQuestionSchema>;
const definitionObject = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(4000),
    reward_points: z.number().int().min(0).max(2147483647),
    questions: z.array(authoringQuestionSchema).min(5).max(100),
  })
  .strict();
export const definitionSchema = definitionObject.superRefine((d, ctx) => {
  if (new Set(d.questions.map((q) => q.field_key)).size !== d.questions.length)
    ctx.addIssue({ code: "custom", message: "Question keys must be unique." });
  const keys = ["age", "income_bracket", "marital_status", "country"];
  if (
    d.questions
      .slice(0, 4)
      .some(
        (q, i) =>
          q.field_key !== keys[i] ||
          q.section !== "demographics" ||
          !q.required,
      ) ||
    d.questions.slice(4).some((q) => q.section !== "body")
  )
    ctx.addIssue({
      code: "custom",
      message: "The four required demographics must come first.",
    });
});
export type Definition = z.infer<typeof definitionSchema>;
export function demographicQuestions(): AuthoringQuestion[] {
  return z.array(authoringQuestionSchema).parse(structuredClone(demographics));
}
export function newQuestion(index: number): AuthoringQuestion {
  return {
    field_key: `question_${index}`,
    section: "body",
    type: "text",
    presentation: "short_text",
    prompt: "Your question",
    required: true,
    config: { version: 1, min: 1, max: 120 },
  };
}
export function newDefinition(): Definition {
  return {
    title: "Untitled survey",
    description: "",
    reward_points: 100,
    questions: [...demographicQuestions(), newQuestion(1)],
  };
}
export const generatedDraftSchema = definitionObject
  .omit({ reward_points: true })
  .extend({ questions: z.array(authoringQuestionSchema).min(1).max(96) });
export function generatedDefinition(
  value: unknown,
  reward: number,
): Definition {
  const draft = generatedDraftSchema.parse(value);
  if (draft.questions.some((q) => q.section !== "body"))
    throw new Error("Gemini must return body questions only.");
  return definitionSchema.parse({
    ...draft,
    reward_points: reward,
    questions: [...demographicQuestions(), ...draft.questions],
  });
}
export const adminSurveySchema = definitionObject
  .omit({ questions: true })
  .extend({
    id: z.uuid(),
    status: z.enum(["draft", "needs_review", "published", "archived"]),
    definition_version: z.number().int(),
    approved_definition_version: z.number().nullable(),
    authoring_source: z.enum(["manual", "gemini"]),
    questions: z.array(
      z.preprocess((value) => {
        if (value && typeof value === "object") {
          const copy = { ...value } as Record<string, unknown>;
          delete copy.id;
          return copy;
        }
        return value;
      }, authoringQuestionSchema),
    ),
  })
  .strip();
