"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
export function ImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  return (
    <form
      className="mt-7 space-y-6 rounded-3xl border border-stone-200 bg-white p-7"
      onChange={() => {
        requestId.current = null;
        setError("");
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        requestId.current ??= crypto.randomUUID();
        try {
          const file = data.get("file");
          if (!(file instanceof File) || file.size > 4194304) {
            setError("Choose a document up to 4 MiB.");
            return;
          }
          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
            ),
          )
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          const retryKey = `pollpoint-import:${hash}:${data.get("reward_points")}`;
          // Retain only retry metadata across reloads, never file contents.
          try {
            requestId.current =
              sessionStorage.getItem(retryKey) || requestId.current;
            sessionStorage.setItem(retryKey, requestId.current!);
          } catch {
            /* In-memory retries still work when storage is disabled. */
          }
          data.set("request_id", requestId.current!);
          const response = await fetch("/api/admin/survey-imports", {
            method: "POST",
            body: data,
            signal: AbortSignal.timeout(115000),
          });
          const result = await response.json();
          if (!response.ok || !result.survey_id)
            setError(
              result.error ||
                "Unable to create a draft. Retry with the same file.",
            );
          else {
            try {
              sessionStorage.removeItem(retryKey);
            } catch {
              /* Storage may be disabled. */
            }
            router.push(`/admin/surveys/${result.survey_id}`);
          }
        } catch {
          setError(
            "The request was interrupted. Retry with the same file and reward to recover the draft without creating a duplicate.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-6">
        <label className="block text-sm font-semibold">
          Requirement document
          <input
            required
            name="file"
            type="file"
            accept=".docx,.pdf,.txt"
            className="file-picker mt-3 block w-full rounded-xl border border-dashed border-brand/30 bg-paper p-3 text-sm"
          />
        </label>
        <label className="block text-sm font-semibold">
          Points per completion
          <input
            name="reward_points"
            required
            className="input-field max-w-48"
            type="number"
            min={0}
            max={2147483647}
            step={1}
            defaultValue={100}
          />
        </label>
        <p className="text-sm leading-6 text-muted">
          Extracted document text is sent to Gemini to draft survey questions.
          Files and extracted text are not stored by PollPoint. Review the
          generated draft in the survey builder, then approve and push it.
        </p>
        <p className="text-xs leading-6 text-muted">
          One file up to 4 MiB. PDFs must contain text and have at most 100
          pages. DOCX files may expand to at most 20 MiB. Extracted text is
          limited to 50,000 characters. Encrypted files and OCR are not
          supported.
        </p>
        <button className="primary-button" type="submit">
          {busy ? "Drafting your survey…" : "Generate draft"}
        </button>
      </fieldset>
      {busy && (
        <p role="status" className="text-sm text-brand">
          Extracting text and drafting questions. This can take about a minute.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </form>
  );
}
