import { LogOut } from "lucide-react";
import { MainNavigation } from "./main-navigation";
import { Brand } from "./brand";
import { logout } from "@/app/actions/auth";

export function AppShell({
  children,
  email,
  admin,
}: {
  children: React.ReactNode;
  email?: string;
  admin: boolean;
  adminArea?: boolean;
}) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-xl bg-white p-4 focus:not-sr-only"
      >
        Skip to content
      </a>
      <header className="app-navigation sticky top-0 z-40 border-b border-stone-200 bg-white shadow-sm">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-6 px-4 sm:px-8 lg:grid-cols-[auto_1fr_auto]">
          <div className="flex h-16 items-center gap-3 lg:h-20">
            <Brand />
            <span className="hidden rounded-md bg-paper px-2 py-1 text-xs font-bold text-muted xl:block">
              {admin ? "Admin" : "Member"}
            </span>
          </div>
          <div className="col-span-2 row-start-2 pb-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pb-0">
            <MainNavigation admin={admin} />
          </div>
          <div className="col-start-2 row-start-1 flex items-center gap-3 lg:col-start-3">
            <span className="hidden max-w-36 truncate text-xs text-muted xl:block">
              {email}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-paper hover:text-ink"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <main id="main-content" tabIndex={-1} className="min-w-0 py-6 sm:py-9">
          {children}
        </main>
        <footer className="border-t border-stone-200 py-6 text-xs text-muted">
          PollPoint · Every perspective has a place.
        </footer>
      </div>
    </div>
  );
}
