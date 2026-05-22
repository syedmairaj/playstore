import { z } from "zod";

export const reviewSyncBodySchema = z.object({
  appId: z.string().uuid(),
  num: z.number().int().min(1).max(200).optional().default(100),
  country: z
    .string()
    .trim()
    .toLowerCase()
    .length(2)
    .optional(),
  lang: z.string().trim().min(2).max(8).optional(),
});

export type ReviewSyncBody = z.infer<typeof reviewSyncBodySchema>;
