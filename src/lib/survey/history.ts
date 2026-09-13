import { z } from "zod";

export const historySchema = z.object({
  total_points: z.string().regex(/^(0|[1-9][0-9]*)$/),
  entries: z.array(z.object({
    id: z.uuid(),
    assignment_id: z.uuid(),
    title: z.string(),
    points: z.number().int().nonnegative(),
    submitted_at: z.iso.datetime({ offset: true }),
  })).max(21),
});

export function formatPoints(points: string) {
  return BigInt(points).toLocaleString("en-IN");
}
