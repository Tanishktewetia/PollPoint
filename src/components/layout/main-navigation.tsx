"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, ShieldCheck } from "lucide-react";

export function MainNavigation({ admin }: { admin: boolean }) {
  const path = usePathname();
  const links = admin
    ? [
        { href: "/admin", label: "Surveys", icon: ShieldCheck },
        { href: "/admin/users", label: "User roster", icon: History },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/history", label: "History & points", icon: History },
      ];
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-wrap gap-2 border-b border-stone-200 py-4"
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          path === href ||
          (href === "/admin" && path.startsWith("/admin/surveys/"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${active ? "bg-lime text-brand" : "text-muted hover:bg-white"}`}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
