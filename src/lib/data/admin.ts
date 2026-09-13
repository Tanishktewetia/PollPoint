import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminSurveySchema } from "@/lib/survey/authoring";
export const rosterRowSchema = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
  total_points: z.string().regex(/^[0-9]+$/),
});
export async function adminRoster(page: number) {
  const c = await createClient();
  const { data, error } = await c.rpc("admin_user_roster", { p_page: page });
  if (error) throw new Error("Could not load the user roster.");
  const rows = z.array(rosterRowSchema).parse(data);
  return { rows: rows.slice(0, 20), hasMore: rows.length > 20 };
}
export async function adminSurvey(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await createClient();
  const { data, error } = await c.rpc("admin_survey", { p_id: id });
  if (error) throw new Error("Could not load this survey.");
  if (!data) notFound();
  return adminSurveySchema.parse(data);
}
export function pageNumber(value?: string) {
  return Math.min(10000, Math.max(1, parseInt(value ?? "1", 10) || 1));
}
