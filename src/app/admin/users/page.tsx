import { requireAdmin } from "@/lib/auth/guards";
import { adminRoster, pageNumber } from "@/lib/data/admin";
import { formatPoints } from "@/lib/survey/history";
import { Pagination } from "@/components/admin/pagination";
export const metadata = { title: "User roster" };
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const page = pageNumber((await searchParams).page);
  const { rows, hasMore } = await adminRoster(page);
  return (
    <>
      <h1 className="text-3xl font-bold">User roster</h1>
      <p className="mb-7 mt-3 text-sm text-muted">
        Read-only participant accounts. Admin accounts are excluded; historical
        awards are unchanged.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Participant names, email addresses and earned points
          </caption>
          <thead className="bg-lime/30">
            <tr className="border-b border-stone-200">
              <th scope="col" className="px-3 py-4 sm:p-5">
                Display name
              </th>
              <th scope="col" className="px-3 py-4 sm:p-5">
                Email
              </th>
              <th scope="col" className="px-3 py-4 text-right sm:p-5">
                Total points earned
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone-100">
                <td className="px-3 py-4 sm:p-5">
                  {r.display_name || "Not provided"}
                </td>
                <td className="max-w-44 break-words px-3 py-4 sm:max-w-none sm:p-5">
                  {r.email || "Not available"}
                </td>
                <td className="px-3 py-4 text-right tabular-nums sm:p-5">
                  {formatPoints(r.total_points)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-6">No participant accounts on this page.</p>
        )}
      </div>
      <Pagination base="/admin/users" page={page} hasMore={hasMore} />
    </>
  );
}
