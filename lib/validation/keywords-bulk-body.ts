import { z } from "zod";

export const keywordsBulkBodySchema = z.object({
  terms: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  appId: z.string().uuid(),
  listingGenerationId: z.string().uuid(),
  market: z.string().trim().min(2).max(8).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
});

export type KeywordsBulkBody = z.infer<typeof keywordsBulkBodySchema>;
