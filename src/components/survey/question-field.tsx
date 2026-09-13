"use client";

import type { Answer, Question } from "@/lib/survey/schema";

export function QuestionField({
  question: q,
  answer,
  onChange,
  error,
  disabled,
}: {
  question: Question;
  answer?: Answer;
  onChange: (value?: Answer) => void;
  error?: string;
  disabled: boolean;
}) {
  const errorId = `${q.id}-error`;
  const common = {
    disabled,
    "aria-describedby": error ? errorId : undefined,
    "aria-invalid": !!error,
  };
  const label = (
    <>
      {q.prompt}{" "}
      {!q.required && (
        <span className="ml-2 text-xs font-normal text-muted">Optional</span>
      )}
    </>
  );
  const optionClass =
    "flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 text-sm transition has-checked:border-brand has-checked:bg-brand/5 hover:border-brand/50 has-disabled:cursor-wait";

  return (
    <fieldset
      id={`question-${q.id}`}
      tabIndex={-1}
      className="min-w-0 scroll-mt-8 rounded-2xl"
      disabled={disabled}
    >
      <legend className="mb-4 w-full text-base font-semibold leading-6">
        {label}
      </legend>
      {q.type === "single_choice" &&
        (q.presentation === "dropdown" ? (
          <select
            {...common}
            aria-label={q.prompt}
            className="input-field mt-0"
            value={answer && "option_id" in answer ? answer.option_id : ""}
            onChange={(e) =>
              onChange(
                e.target.value ? { option_id: e.target.value } : undefined,
              )
            }
          >
            <option value="">Select an option</option>
            {q.config.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {q.config.options.map((o) => (
              <label key={o.id} className={optionClass}>
                <input
                  {...common}
                  type="radio"
                  name={q.id}
                  value={o.id}
                  className="size-4 shrink-0 accent-brand"
                  checked={
                    !!answer &&
                    "option_id" in answer &&
                    answer.option_id === o.id
                  }
                  onChange={() => onChange({ option_id: o.id })}
                />
                {o.label}
              </label>
            ))}
          </div>
        ))}
      {q.type === "multi_choice" && (
        <>
          <p className="mb-3 text-xs text-muted">
            Choose {q.config.min}–{q.config.max} options.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {q.config.options.map((o) => {
              const ids =
                answer && "option_ids" in answer ? answer.option_ids : [];
              return (
                <label key={o.id} className={optionClass}>
                  <input
                    {...common}
                    type="checkbox"
                    value={o.id}
                    className="size-4 shrink-0 accent-brand"
                    checked={ids.includes(o.id)}
                    onChange={() => {
                      const exclusive = q.config.exclusive_option_ids ?? [];
                      const next = ids.includes(o.id)
                        ? ids.filter((id) => id !== o.id)
                        : exclusive.includes(o.id)
                          ? [o.id]
                          : [
                              ...ids.filter((id) => !exclusive.includes(id)),
                              o.id,
                            ];
                      onChange(next.length ? { option_ids: next } : undefined);
                    }}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </>
      )}
      {q.type === "text" && (
        <>
          {q.presentation === "long_text" ? (
            <textarea
              {...common}
              aria-label={q.prompt}
              className="input-field mt-0 min-h-32 resize-y"
              rows={4}
              maxLength={q.config.max * 2}
              value={answer && "text" in answer ? answer.text : ""}
              onChange={(e) =>
                onChange(e.target.value ? { text: e.target.value } : undefined)
              }
            />
          ) : (
            <input
              {...common}
              aria-label={q.prompt}
              type="text"
              className="input-field mt-0"
              maxLength={q.config.max * 2}
              value={answer && "text" in answer ? answer.text : ""}
              onChange={(e) =>
                onChange(e.target.value ? { text: e.target.value } : undefined)
              }
            />
          )}
          <p className="mt-2 text-right text-xs text-muted">
            {answer && "text" in answer
              ? Array.from(answer.text.trim()).length
              : 0}{" "}
            / {q.config.max} characters
          </p>
        </>
      )}
      {q.type === "integer" && (
        <div className="space-y-3">
          <input
            {...common}
            disabled={disabled || (!!answer && "declined" in answer)}
            aria-label={q.prompt}
            type="number"
            inputMode="numeric"
            min={q.config.min}
            max={q.config.max}
            step={1}
            className="input-field mt-0 max-w-52 disabled:bg-stone-100"
            value={answer && "value" in answer ? answer.value : ""}
            onChange={(e) =>
              onChange(
                e.target.value !== ""
                  ? { value: e.target.valueAsNumber }
                  : undefined,
              )
            }
          />
          {q.config.allow_decline && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={!!answer && "declined" in answer}
                onChange={(e) =>
                  onChange(e.target.checked ? { declined: true } : undefined)
                }
              />
              Prefer not to say
            </label>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
