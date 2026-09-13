const allowedRoots = ["/dashboard", "/history", "/surveys", "/admin"];

export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || /[\\\u0000-\u0020%]/.test(value)) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  const url = new URL(value, "https://pollpoint.invalid");
  if (url.origin !== "https://pollpoint.invalid") return "/dashboard";
  const allowed = allowedRoots.some((root) => url.pathname === root || url.pathname.startsWith(`${root}/`));
  return allowed ? `${url.pathname}${url.search}` : "/dashboard";
}
