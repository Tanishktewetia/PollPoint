import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { readUpload } from "@/lib/server/imports/upload";
import { extractText } from "@/lib/server/imports/extract";
import {
  generateDraft,
  geminiConfig,
  PROMPT_VERSION,
} from "@/lib/server/imports/gemini";
import { generatedDefinition } from "@/lib/survey/authoring";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "Invalid request origin." }, 403);
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return reply({ error: "Sign in to continue." }, 401);
  const membership = await client.rpc("admin_session");
  if (membership.error || membership.data !== true)
    return reply({ error: "Admin access required." }, 403);
  let importId: string | undefined,
    lease: string | undefined,
    stage = "extraction_failed";
  try {
    const config = geminiConfig();
    const upload = await readUpload(request);
    const started = await client.rpc("admin_begin_import", {
      p_request_id: upload.requestId,
      p_meta: {
        hash: createHash("sha256").update(upload.bytes).digest("hex"),
        filename: upload.filename,
        mime: upload.mime,
        bytes: upload.bytes.length,
        reward_points: upload.reward,
        model: config.model,
        prompt_version: PROMPT_VERSION,
      },
    });
    if (started.error)
      return reply(
        {
          error:
            started.error.code === "54000"
              ? "Hourly import limit reached. Try again later."
              : started.error.code === "55P03"
                ? "Generation is busy. Retry shortly with the same file."
                : "Import could not start. For a retry, use the same document and reward.",
        },
        409,
      );
    const result = z
      .object({
        id: z.uuid(),
        status: z.string(),
        survey_id: z.uuid().optional(),
        lease_token: z.uuid().optional(),
      })
      .parse(started.data);
    if (result.status === "ready")
      return reply({ survey_id: result.survey_id, import_id: result.id });
    importId = result.id;
    lease = result.lease_token;
    if (!lease) throw new Error("Unable to start import.");
    const text = await extractText(upload.bytes, upload.kind);
    stage = "provider_failed";
    const generated = await generateDraft(text);
    stage = "invalid_draft";
    const definition = generatedDefinition(generated, upload.reward);
    const saved = await client.rpc("admin_finish_import", {
      p_id: importId,
      p_lease: lease,
      p_definition: definition,
    });
    if (saved.error)
      throw new Error(
        "The draft could not be validated or saved. Retry with the same file.",
      );
    const survey = z.object({ survey_id: z.uuid() }).parse(saved.data);
    return reply({ ...survey, import_id: importId });
  } catch (error) {
    if (importId && lease)
      await client.rpc("admin_fail_import", {
        p_id: importId,
        p_lease: lease,
        p_error: stage,
      });
    const message =
      error instanceof z.ZodError
        ? "The generated survey did not match the required question format. Review the requirements and retry."
        : error instanceof Error && ["Error"].includes(error.name)
          ? error.message
          : "The import failed. Try again with the same file.";
    return reply({ error: message, import_id: importId }, 422);
  }
}
