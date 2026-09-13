import { requireAdmin } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <AppShell email={user.email} admin adminArea>{children}</AppShell>;
}
