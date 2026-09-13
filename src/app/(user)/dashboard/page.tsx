import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { requireParticipant } from "@/lib/auth/guards";
import { availableSurveys } from "@/lib/data/surveys";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; page?: string }>;
}) {
  await requireParticipant();
  const params = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const { cards, hasMore } = await availableSurveys(page);
  return (
    <>
      {params.notice === "admin-only" && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          This account does not have admin access.
        </p>
      )}
      <div className="hero-panel rounded-3xl bg-brand px-7 py-9 text-white sm:px-10">
        <p className="eyebrow mb-4 text-lime">
          A little perspective goes a long way
        </p>
        <h1 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
          Your next opinion could be a rewarding one.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/80">
          Explore your surveys, share what you think, and earn points for every
          completed response.
        </p>
        <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-lime">
          <Sparkles size={16} aria-hidden="true" />
          Your voice makes a difference
        </span>
      </div>
      <div className="mb-6 mt-10 flex items-center justify-between">
        <h2 className="text-xl font-bold">Surveys for you</h2>
        <span className="text-xs text-muted">Page {page}</span>
      </div>
      {cards.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.id}
              className="survey-card flex flex-col rounded-2xl border border-stone-200 bg-white p-6"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand/5 text-brand">
                  <ClipboardList size={23} aria-hidden="true" />
                </span>
                <span className="rounded-full bg-lime/50 px-3 py-1.5 text-sm font-bold text-brand">
                  {card.reward_points} points
                </span>
              </div>
              <h3 className="text-xl font-bold">{card.title}</h3>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
                {card.description}
              </p>
              <div className="mt-auto flex items-center justify-between gap-4 pt-7">
                <span className="text-xs text-muted">
                  {card.question_count} questions
                </span>
                <Link
                  className="primary-button text-sm"
                  href={`/surveys/${card.id}`}
                >
                  Take survey
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-stone-200 bg-white px-6 py-10 text-center">
          <MessageCircle
            size={30}
            className="mb-5 text-brand"
            aria-hidden="true"
          />
          <h3 className="text-xl font-bold">You’re all caught up.</h3>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted">
            There are no surveys waiting here right now. Check back when a new
            survey is shared with you.
          </p>
        </section>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label="Survey pages"
          className="mt-6 flex justify-between text-sm font-semibold text-brand"
        >
          {page > 1 ? (
            <Link href={`/dashboard?page=${page - 1}`}>Previous page</Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/dashboard?page=${page + 1}`}>Next page</Link>
          )}
        </nav>
      )}
    </>
  );
}
