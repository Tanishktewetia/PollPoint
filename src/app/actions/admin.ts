"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { adminSurveySchema, definitionSchema } from "@/lib/survey/authoring";
function message(code?: string) {
  return code === "40001"
    ? "This survey changed. Reload before continuing."
    : code === "42501"
      ? "Admin access is required."
      : "Check the survey and try again. All changes must pass validation.";
}
export async function saveSurvey(
  id: string | null,
  version: number | null,
  value: unknown,
) {
  await requireAdmin();
  const definition = definitionSchema.safeParse(value);
  if (!definition.success)
    return {
      error: definition.error.issues
        .map((i) => i.message)
        .slice(0, 3)
        .join(" "),
    };
  if (Buffer.byteLength(JSON.stringify(definition.data)) > 524288)
    return { error: "Survey is too large." };
  if (id && !z.uuid().safeParse(id).success)
    return { error: "Invalid survey." };
  const client = await createClient();
  const { data, error } = await client.rpc("admin_save_survey", {
    p_id: id,
    p_version: version,
    p_definition: definition.data,
  });
  if (error) return { error: message(error.code) };
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/surveys/${id}`);
  return { survey: adminSurveySchema.parse(data) };
}
export async function approveSurvey(id: string, version: number) {
  await requireAdmin();
  z.uuid().parse(id);
  const client = await createClient();
  const { data, error } = await client.rpc("admin_approve_survey", {
    p_id: id,
    p_version: version,
  });
  if (error) return { error: message(error.code) };
  revalidatePath("/admin");
  revalidatePath(`/admin/surveys/${id}`);
  return { survey: adminSurveySchema.parse(data) };
}
export async function copySurvey(id: string) {
  await requireAdmin();
  z.uuid().parse(id);
  const client = await createClient();
  const { data, error } = await client.rpc("admin_copy_survey", { p_id: id });
  if (error) return { error: message(error.code) };
  revalidatePath("/admin");
  return { survey: adminSurveySchema.parse(data) };
}
export async function archiveSurvey(id: string) {
  await requireAdmin();
  z.uuid().parse(id);
  const client = await createClient();
  const { error } = await client.rpc("admin_archive_survey", { p_id: id });
  if (error) return { error: message(error.code) };
  revalidatePath("/admin");
  revalidatePath(`/admin/surveys/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}
export async function pushSurvey(value: unknown) {
  await requireAdmin();
  const input = z
    .object({
      id: z.uuid(),
      version: z.number().int(),
      audience: z.enum(["all", "selected"]),
      users: z.array(z.uuid()).max(10000),
      requestId: z.uuid(),
    })
    .strict()
    .safeParse(value);
  if (!input.success) return { error: "Choose a valid audience." };
  const p = input.data;
  const client = await createClient();
  const { data, error } = await client.rpc("admin_push_survey", {
    p_id: p.id,
    p_version: p.version,
    p_audience: p.audience,
    p_users: p.users,
    p_request_id: p.requestId,
  });
  if (error)
    return {
      error:
        error.code === "22023"
          ? "Approve the current draft and choose at least one non-admin recipient. If changing a retried push, start a new push."
          : message(error.code),
    };
  revalidatePath("/admin");
  revalidatePath(`/admin/surveys/${p.id}`);
  revalidatePath("/dashboard");
  return {
    receipt: z
      .object({
        id: z.uuid(),
        targeted: z.number(),
        assigned: z.number(),
        already_assigned: z.number(),
      })
      .parse(data),
  };
}

export async function rosterPage(page: number) {
  await requireAdmin();
  const { adminRoster } = await import("@/lib/data/admin");
  return adminRoster(z.number().int().min(1).max(500).parse(page));
}
