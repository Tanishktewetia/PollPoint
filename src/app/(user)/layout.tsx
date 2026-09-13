import { requireUser, getAdminStatus } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/app-shell";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell email={user.email} admin={await getAdminStatus()}>{children}</AppShell>;
}
