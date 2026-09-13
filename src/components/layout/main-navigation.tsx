"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, ShieldCheck } from "lucide-react";

export function MainNavigation({ admin }: { admin: boolean }) {
  const path = usePathname();
  const links = admin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/history", label: "History & points", icon: History },
  ];
  return <nav aria-label="Main navigation" className="flex flex-wrap gap-6 border-b border-stone-200 py-5">{links.map(({href,label,icon: Icon}) => {
    const active = path === href || (href === "/admin" && path.startsWith("/admin/"));
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 text-sm font-semibold ${active ? "text-brand" : "text-muted"}`}><Icon size={18} aria-hidden="true" />{label}</Link>;
  })}</nav>;
}
