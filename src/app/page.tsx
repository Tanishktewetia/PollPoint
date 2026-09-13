import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/guards";

export default async function HomePage() {
  redirect((await getUser()) ? "/dashboard" : "/login");
}
