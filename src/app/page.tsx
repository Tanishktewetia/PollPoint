import { redirect } from "next/navigation";
import { getUser, getAdminStatus } from "@/lib/auth/guards";

export default async function HomePage() {
  if (!await getUser()) redirect("/login");
  redirect(await getAdminStatus() ? "/admin" : "/dashboard");
}
