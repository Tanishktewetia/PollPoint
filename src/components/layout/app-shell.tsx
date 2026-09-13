import { LogOut } from "lucide-react";
import { MainNavigation } from "./main-navigation";
import { Brand } from "./brand";
import { logout } from "@/app/actions/auth";

export function AppShell({ children, email, admin }: { children: React.ReactNode; email?: string; admin: boolean; adminArea?: boolean }) {
  return <div className="min-h-dvh"><a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded-xl bg-white p-4 focus:not-sr-only">Skip to content</a><header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8"><Brand /><div className="flex items-center gap-4"><span className="hidden max-w-56 truncate text-sm text-muted md:block">{email}</span><form action={logout}><button type="submit" className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-paper hover:text-ink"><LogOut size={16} aria-hidden="true" />Sign out</button></form></div></div></header><div className="mx-auto max-w-6xl px-5 sm:px-8"><MainNavigation admin={admin} /><main id="main-content" className="py-10 sm:py-14">{children}</main><footer className="border-t border-stone-200 py-6 text-xs text-muted">PollPoint · Every perspective has a place.</footer></div></div>;
}
