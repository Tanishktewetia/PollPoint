import { createClient } from "@supabase/supabase-js";
import { required } from "./env.mjs";

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(15000) });
if (!settings.ok) throw new Error(`Supabase Auth settings unavailable (${settings.status})`);
const auth = await settings.json();
console.log(`Supabase Auth reachable. Email provider: ${auth.external?.email === true}. Email confirmation: ${auth.mailer_autoconfirm === false}.`);
const { error } = await client.from("profiles").select("id").limit(0);
console.log(`Anonymous profile read: ${error ? `denied (${error.code})` : "allowed — review grants"}.`);
if (error?.code === "PGRST205" || error?.code === "42P01") {
  console.log("PollPoint schema is not deployed to this project yet.");
  process.exitCode = 2;
} else if (!error) {
  process.exitCode = 1;
}
const { error: rpcError } = await client.rpc("admin_session");
console.log(`Anonymous admin RPC: ${rpcError ? `denied (${rpcError.code})` : "allowed — review grants"}.`);
if (!rpcError) process.exitCode = 1;
