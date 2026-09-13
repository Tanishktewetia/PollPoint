import Link from "next/link";
export function Pagination({
  base,
  page,
  hasMore,
}: {
  base: string;
  page: number;
  hasMore: boolean;
}) {
  return (
    <nav
      aria-label="Pages"
      className="mt-6 flex items-center justify-between gap-5 text-sm font-semibold text-brand"
    >
      {page > 1 ? (
        <Link href={`${base}?page=${page - 1}`}>Previous page</Link>
      ) : (
        <span />
      )}
      <span>Page {page}</span>
      {hasMore && page < 10000 ? (
        <Link href={`${base}?page=${page + 1}`}>Next page</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
