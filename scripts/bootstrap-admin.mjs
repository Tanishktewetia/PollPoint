import { createClient } from "@supabase/supabase-js";
import { required } from "./env.mjs";

const userId = process.argv[2];
if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  throw new Error("Usage: npm run admin:bootstrap -- <owner-confirmed-auth-user-uuid>");
}
const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error: lookupError } = await client.auth.admin.getUserById(userId);
if (lookupError || !data.user) throw new Error("The specified Auth user does not exist.");
if (!data.user.email_confirmed_at) throw new Error("Confirm this account's email before granting admin access.");
const { error } = await client.rpc("bootstrap_first_admin", { target_user_id: userId });
if (error) throw new Error(`Admin bootstrap failed (${error.code}): ${error.message}`);
console.log("Initial admin provisioned for the confirmed UUID. No public bootstrap endpoint was created.");
