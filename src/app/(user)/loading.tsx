export default function Loading() {
  return (
    <div role="status" className="mx-auto max-w-3xl py-10">
      <p className="mb-6 text-sm text-muted">Loading your PollPoint space…</p>
      <div
        aria-hidden="true"
        className="h-56 animate-pulse rounded-3xl bg-stone-200"
      />
    </div>
  );
}
