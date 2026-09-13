import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  const { importId } = await params;
  if (!z.uuid().safeParse(importId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = await createClient();
  const { data, error } = await client.rpc("admin_import_status", {
    p_id: importId,
  });
  return NextResponse.json(error || !data ? { error: "Not found" } : data, {
    status: error || !data ? 404 : 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}
