"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, ClipboardList, Users } from "lucide-react";

export function MainNavigation({ admin }: { admin: boolean }) {
  const path = usePathname();
  const links = admin
    ? [
        { href: "/admin", label: "Surveys", icon: ClipboardList },
        { href: "/admin/users", label: "User roster", icon: Users },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/history", label: "History & points", icon: History },
      ];
  return (
    <nav
      aria-label="Main navigation"
      className="grid grid-cols-2 gap-2 lg:flex"
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          path === href ||
          (href === "/admin" && path.startsWith("/admin/surveys/")) ||
          (href === "/dashboard" && path.startsWith("/surveys/"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition lg:px-5 ${active ? "border-brand bg-brand text-white shadow-sm after:absolute after:inset-x-4 after:bottom-0 after:h-1 after:rounded-t after:bg-lime" : "border-transparent text-muted hover:border-stone-200 hover:bg-paper"}`}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
