import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/auth/redirect";
import { getSiteUrl } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const supabase = await createClient();
  let verified = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type === "email") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    verified = !error;
  }
  const membership = verified ? await supabase.rpc("is_admin") : null;
  const destination = membership?.data === true ? "/admin" : verified ? safeRedirect(params.get("next")) : "/login?error=confirmation";
  const response = NextResponse.redirect(new URL(destination, getSiteUrl()));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
