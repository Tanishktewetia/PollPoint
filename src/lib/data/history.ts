import "server-only";
import { createClient } from "@/lib/supabase/server";
import { historySchema } from "@/lib/survey/history";

export async function participantHistory(page: number) {
  const client = await createClient();
  const { data, error } = await client.rpc("participant_history", { p_page: page });
  if (error) throw new Error("We could not load your history. Please try again.");
  const history = historySchema.parse(data);
  return { totalPoints: history.total_points, entries: history.entries.slice(0, 20), hasMore: history.entries.length > 20 };
}
