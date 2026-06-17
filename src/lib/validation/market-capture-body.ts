import { z } from "zod";

const queueItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: z.string().optional(),
  content: z.string(),
  source: z.string(),
  language: z.enum(["en", "ar"]),
  stagedAt: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export const marketCaptureBodySchema = z.object({
  workspaceId: z.string().uuid(),
  competitorName: z.string().trim().min(1).max(120),
  locale: z.enum(["en", "ar"]).default("en"),
  appName: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  appFeatures: z.string().trim().min(1).max(8000),
  queueItems: z.array(queueItemSchema).max(80).default([]),
  seedKeywords: z.array(z.string().max(80)).max(40).optional(),
  currentListing: z
    .object({
      title: z.string().max(30).optional(),
      shortDescription: z.string().max(80).optional(),
      fullDescription: z.string().max(4000).optional(),
    })
    .optional(),
});

export type MarketCaptureBody = z.infer<typeof marketCaptureBodySchema>;
