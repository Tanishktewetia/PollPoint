import { createClient } from "@supabase/supabase-js";
import { required } from "./env.mjs";

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(15000) });
if (!settings.ok) throw new Error(`Supabase Auth settings unavailable (${settings.status})`);
const auth = await settings.json();
console.log(`Supabase Auth reachable. Email provider: ${auth.external?.email === true}. Email confirmation: ${auth.mailer_autoconfirm === false}.`);
if (auth.external?.email !== true || auth.mailer_autoconfirm !== false) process.exitCode = 1;
const { error } = await client.from("profiles").select("id").limit(0);
console.log(`Anonymous profile read: ${error ? `denied (${error.code})` : "allowed — review grants"}.`);
if (error?.code === "PGRST205" || error?.code === "42P01") {
  console.log("PollPoint schema is not deployed to this project yet.");
  process.exitCode = 2;
} else if (error?.code !== "42501") {
  process.exitCode = 1;
}
const { error: rpcError } = await client.rpc("admin_session");
console.log(`Anonymous admin RPC: ${rpcError ? `denied (${rpcError.code})` : "allowed — review grants"}.`);
if (rpcError?.code !== "42501") process.exitCode = 1;
const { error: submissionError } = await client.rpc("submit_survey", {
  p_assignment_id: "00000000-0000-4000-8000-000000000000", p_answers: [],
});
console.log(`Anonymous survey submission: ${submissionError ? `denied (${submissionError.code})` : "allowed — review grants"}.`);
if (submissionError?.code !== "42501") process.exitCode = 1;

const { error: historyError } = await client.rpc("participant_history", { p_page: 1 });
console.log(`Anonymous history: ${historyError ? `denied (${historyError.code})` : "allowed - review grants"}.`);
if (historyError?.code !== "42501") process.exitCode = 1;
