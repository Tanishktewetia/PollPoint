import { requireParticipant } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/app-shell";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = await requireParticipant();
  return <AppShell email={user.email} admin={false}>{children}</AppShell>;
}
