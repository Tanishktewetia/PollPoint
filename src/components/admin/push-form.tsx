"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { pushSurvey, rosterPage } from "@/app/actions/admin";
type User = { id: string; display_name: string | null; email: string | null };
export function PushForm({
  id,
  version,
  users,
  hasMore,
  eligible,
}: {
  id: string;
  version: number;
  users: User[];
  hasMore: boolean;
  eligible: boolean;
}) {
  const [options, setOptions] = useState(users),
    [more, setMore] = useState(hasMore),
    [page, setPage] = useState(1);
  const [audience, setAudience] = useState<"all" | "selected">("all"),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    targeted: number;
    assigned: number;
    already_assigned: number;
  } | null>(null);
  const [pending, start] = useTransition();
  const requestId = useRef<string | null>(null);
  function reset() {
    requestId.current = null;
    setReceipt(null);
    setError("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!eligible || pending) return;
        requestId.current ??= crypto.randomUUID();
        start(async () => {
          try {
            const result = await pushSurvey({
              id,
              version,
              audience,
              users: audience === "all" ? [] : selected,
              requestId: requestId.current,
            });
            if (result.error) setError(result.error);
            else if (result.receipt) {
              setError("");
              setReceipt(result.receipt);
            }
          } catch {
            setError(
              "Could not confirm the push. Retry to recover the same result.",
            );
          }
        });
      }}
      className="space-y-5 rounded-3xl border border-stone-200 bg-white p-7"
    >
      <fieldset
        disabled={!eligible || pending || !!receipt}
        className="space-y-5"
      >
        <label className="block text-sm">
          <input
            type="radio"
            checked={audience === "all"}
            onChange={() => {
              setAudience("all");
              reset();
            }}
          />{" "}
          All registered participants
        </label>
        <p className="text-xs text-muted">
          Admins are excluded. Later signups need another push.
        </p>
        <label className="block text-sm">
          <input
            type="radio"
            checked={audience === "selected"}
            onChange={() => {
              setAudience("selected");
              reset();
            }}
          />{" "}
          Selected participants
        </label>
        {audience === "selected" && (
          <div className="max-h-96 space-y-3 overflow-auto rounded-xl border border-stone-200 p-4">
            {options.map((u) => (
              <label key={u.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(u.id)}
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, u.id]
                        : selected.filter((x) => x !== u.id),
                    );
                    reset();
                  }}
                />
                <span>
                  {u.display_name || "Unnamed participant"}
                  <span className="block break-all text-xs text-muted">
                    {u.email || "Email unavailable"}
                  </span>
                </span>
              </label>
            ))}
            {!options.length && <p>No participants yet.</p>}
            {more && page < 500 && (
              <button
                type="button"
                className="font-semibold text-brand"
                onClick={() =>
                  start(async () => {
                    try {
                      const next = await rosterPage(page + 1);
                      setOptions((old) => [
                        ...old,
                        ...next.rows.filter(
                          (r) => !old.some((u) => u.id === r.id),
                        ),
                      ]);
                      setPage(page + 1);
                      setMore(next.hasMore);
                    } catch {
                      setError("Could not load more participants.");
                    }
                  })
                }
              >
                Load more participants
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          className="primary-button"
          disabled={audience === "selected" && !selected.length}
        >
          {pending ? "Pushing…" : "Push survey"}
        </button>
      </fieldset>
      {!eligible && (
        <p className="text-sm text-amber-800">
          Approve the current draft in the{" "}
          <Link className="underline" href={`/admin/surveys/${id}`}>
            builder
          </Link>{" "}
          before pushing.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {receipt && (
        <div
          role="status"
          className="rounded-xl bg-lime p-5 text-sm text-brand"
        >
          <p>
            Push complete: {receipt.targeted} targeted, {receipt.assigned} newly
            assigned, {receipt.already_assigned} already assigned.
          </p>
          <button
            type="button"
            className="mt-3 font-bold underline"
            onClick={reset}
          >
            Start another push
          </button>
        </div>
      )}
    </form>
  );
}
