import { z } from "zod";

const option = z.object({ id: z.string(), label: z.string() }).strict();
const base = {
  id: z.uuid(),
  field_key: z.string(),
  section: z.enum(["demographics", "body"]),
  prompt: z.string(),
  required: z.boolean(),
};
const choiceConfig = z
  .object({ version: z.literal(1), options: z.array(option).min(1).max(250) })
  .strict();
const bounds = {
  version: z.literal(1),
  min: z.number().int(),
  max: z.number().int(),
};

export const questionSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("single_choice"),
      presentation: z.enum(["dropdown", "radio_cards"]),
      config: choiceConfig,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("multi_choice"),
      presentation: z.literal("checkbox_cards"),
      config: choiceConfig.extend({
        min: z.number().int(),
        max: z.number().int(),
        exclusive_option_ids: z.array(z.string()).optional(),
      }),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("text"),
      presentation: z.enum(["short_text", "long_text"]),
      config: z.object(bounds).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("integer"),
      presentation: z.literal("number_input"),
      config: z
        .object({ ...bounds, allow_decline: z.boolean().optional() })
        .strict(),
    })
    .strict(),
]);

export const receiptSchema = z.object({
  id: z.uuid(),
  points: z.number().int().nonnegative(),
  submitted_at: z.string(),
  title: z.string().optional(),
});
export const surveySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  reward_points: z.number().int(),
  questions: z.array(questionSchema).min(5).max(100),
  receipt: receiptSchema.nullable(),
});
export const surveyCardSchema = z.object({
  id: z.uuid(),
  assigned_at: z.string(),
  title: z.string(),
  description: z.string(),
  reward_points: z.number().int(),
  question_count: z.number().int(),
});
export const answerSchema = z.union([
  z.object({ option_id: z.string() }).strict(),
  z.object({ option_ids: z.array(z.string()).max(250) }).strict(),
  z.object({ text: z.string().max(8000) }).strict(),
  z.object({ value: z.number().int() }).strict(),
  z.object({ declined: z.literal(true) }).strict(),
]);
export const submissionSchema = z
  .object({
    assignmentId: z.uuid(),
    answers: z
      .array(z.object({ question_id: z.uuid(), answer: answerSchema }).strict())
      .max(100),
  })
  .strict();

export type Question = z.infer<typeof questionSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Survey = z.infer<typeof surveySchema>;
export type SurveyCard = z.infer<typeof surveyCardSchema>;

export function answerError(
  question: Question,
  answer?: Answer,
): string | null {
  if (!answer) return question.required ? "Please answer this question." : null;
  const cfg = question.config;
  switch (question.type) {
    case "single_choice":
      return "option_id" in answer &&
        question.config.options.some((o) => o.id === answer.option_id)
        ? null
        : "Choose one of the available options.";
    case "multi_choice": {
      if (!("option_ids" in answer)) return "Choose the options that apply.";
      const ids = answer.option_ids;
      const { min, max, options, exclusive_option_ids = [] } = question.config;
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !options.some((o) => o.id === id))
      )
        return "Choose valid options.";
      if (
        ids.length < Math.max(min, question.required ? 1 : 0) ||
        ids.length > max
      )
        return `Choose between ${Math.max(min, question.required ? 1 : 0)} and ${max} options.`;
      if (ids.length > 1 && ids.some((id) => exclusive_option_ids.includes(id)))
        return "This option must be selected on its own.";
      return null;
    }
    case "text": {
      if (!("text" in answer)) return "Enter your answer.";
      const length = Array.from(answer.text.trim()).length;
      return length >=
        Math.max(question.config.min, question.required ? 1 : 0) &&
        length <= question.config.max
        ? null
        : `Enter ${Math.max(question.config.min, question.required ? 1 : 0)}–${question.config.max} characters.`;
    }
    case "integer":
      if ("declined" in answer && question.config.allow_decline) return null;
      return "value" in answer &&
        Number.isInteger(answer.value) &&
        "min" in cfg &&
        answer.value >= cfg.min &&
        answer.value <= cfg.max
        ? null
        : `Enter a whole number from ${question.config.min} to ${question.config.max}.`;
  }
}

export function answerLabel(question: Question, answer?: Answer): string {
  if (!answer) return "Not answered";
  if ("declined" in answer) return "Prefer not to say";
  if ("text" in answer) return answer.text;
  if ("value" in answer) return String(answer.value);
  if ("options" in question.config) {
    const ids = "option_id" in answer ? [answer.option_id] : answer.option_ids;
    return ids
      .map(
        (id) =>
          (
            question.config as { options: { id: string; label: string }[] }
          ).options.find((o) => o.id === id)?.label ?? id,
      )
      .join(", ");
  }
  return "Not answered";
}
