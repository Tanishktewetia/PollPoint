import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { ImportForm } from "@/components/admin/import-form";
export const metadata = { title: "Draft from a document" };
export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/admin" className="text-sm font-semibold text-brand">
        Back to surveys
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Draft from a document</h1>
      <p className="mt-3 text-sm text-muted">
        Turn company requirements into a survey you can review and edit.
      </p>
      <ImportForm />
    </>
  );
}
