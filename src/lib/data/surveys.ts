import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { surveySchema, surveyCardSchema } from "@/lib/survey/schema";

export async function availableSurveys(page: number) {
  const client = await createClient();
  const { data, error } = await client.rpc("available_surveys", {
    p_page: page,
  });
  if (error)
    throw new Error("We couldn’t load your surveys. Please try again.");
  const cards = z.array(surveyCardSchema).parse(data);
  return { cards: cards.slice(0, 20), hasMore: cards.length > 20 };
}

export async function assignedSurvey(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await createClient();
  const { data, error } = await client.rpc("assigned_survey", {
    p_assignment_id: id,
  });
  if (error) throw new Error("We couldn’t load this survey. Please try again.");
  if (!data) notFound();
  return surveySchema.parse(data);
}
