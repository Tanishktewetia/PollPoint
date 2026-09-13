import Link from "next/link";
import { ArrowRight, CheckCircle2, Coins } from "lucide-react";
import { requireParticipant } from "@/lib/auth/guards";
import { participantHistory } from "@/lib/data/history";
import { formatPoints } from "@/lib/survey/history";

export const metadata = { title: "History & points" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireParticipant("/history");
  const params = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const { totalPoints, entries, hasMore } = await participantHistory(page);
  return (
    <>
      <p className="eyebrow mb-3 text-brand">Every response counts</p>
      <h1 className="text-3xl font-bold tracking-tight">History & points</h1>
      <section
        aria-label="Points balance"
        className="hero-panel mt-7 rounded-3xl bg-brand p-7 text-white sm:p-9"
      >
        <div className="flex items-center gap-2 text-sm text-lime">
          <Coins size={20} aria-hidden="true" />
          Total points earned
        </div>
        <p className="mt-4 break-words text-4xl font-bold sm:text-5xl">
          {formatPoints(totalPoints)}{" "}
          <span className="text-base font-medium">points</span>
        </p>
        <p className="mt-4 text-sm leading-6 text-white/80">
          Your points balance from completed surveys.
        </p>
      </section>
      <div className="mb-5 mt-10 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Completed surveys</h2>
        <span className="text-xs text-muted">Page {page}</span>
      </div>
      {entries.length ? (
        <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white px-6">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-4 py-6"
            >
              <div className="min-w-0 flex-1">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Completed
                </p>
                <h3 className="break-words font-bold">{entry.title}</h3>
                <time
                  dateTime={entry.submitted_at}
                  className="mt-2 block text-xs text-muted"
                >
                  {new Date(entry.submitted_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>
              </div>
              <div className="flex items-center gap-5">
                <span className="whitespace-nowrap rounded-full bg-lime px-3 py-2 text-sm font-bold text-brand">
                  +{formatPoints(String(entry.points))} points
                </span>
                <Link
                  href={`/surveys/${entry.assignment_id}/complete`}
                  aria-label={`View receipt for ${entry.title}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
                >
                  Receipt <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <h3 className="text-lg font-bold">
            {page === 1
              ? "Your first completion starts here."
              : "No completions on this page."}
          </h3>
          <p className="mb-5 mt-3 text-sm text-muted">
            {page === 1
              ? "Complete a survey to see your points and receipt here."
              : "Go back to see your earlier results."}
          </p>
          <Link href="/dashboard" className="primary-button">
            Explore surveys <ArrowRight size={16} />
          </Link>
        </section>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label="History pages"
          className="mt-6 flex justify-between gap-4"
        >
          {page > 1 ? (
            <Link
              href={`/history?page=${page - 1}`}
              className="text-sm font-semibold text-brand"
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          {hasMore && page < 10000 && (
            <Link
              href={`/history?page=${page + 1}`}
              className="text-sm font-semibold text-brand"
            >
              Next page
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
