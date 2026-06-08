import { z } from "zod";

const gapSchema = z.object({
  keyword: z.string().min(1).max(120),
  opportunity: z.enum(["high", "medium"]),
});

const sharedSchema = z.object({
  keyword: z.string().min(1).max(120),
  yourRank: z.number().int().min(1).max(200).nullable(),
  theirRank: z.number().int().min(1).max(200),
});

const quickWinPlanSchema = z.discriminatedUnion("key", [
  z.object({
    key: z.literal("tplTrail"),
    keyword: z.string().min(1).max(120),
    yourRank: z.number().int().min(1).max(200),
    theirRank: z.number().int().min(1).max(200),
  }),
  z.object({ key: z.literal("tplAbsent"), keyword: z.string().min(1).max(120) }),
  z.object({
    key: z.literal("tplAhead"),
    keyword: z.string().min(1).max(120),
    yourRank: z.number().int().min(1).max(200),
    theirRank: z.number().int().min(1).max(200),
  }),
  z.object({
    key: z.literal("tplTie"),
    keyword: z.string().min(1).max(120),
    rank: z.number().int().min(1).max(200),
  }),
  z.object({ key: z.literal("tplGap"), term: z.string().min(1).max(120) }),
]);

const previewItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  packageId: z.string().nullable(),
  position: z.number(),
  snippet: z.string().nullable(),
});

const previewCountrySchema = z.object({
  country: z.string(),
  gl: z.string(),
  hl: z.string(),
  items: z.array(previewItemSchema).max(40),
  error: z.string().nullable(),
});

export const competitorAnalysisPayloadSchema = z.object({
  query: z.string().min(1).max(200),
  topKeywords: z.array(z.string().max(80)).max(24),
  shared: z.array(sharedSchema).max(48),
  quickWinPlans: z.array(quickWinPlanSchema).max(24),
  quickWinTerms: z.array(z.string().max(120)).max(24),
  gaps: z.array(gapSchema).max(32),
  previewResults: z.array(previewCountrySchema).max(8).optional(),
});

export const saveCompetitorAnalysisBodySchema = z.object({
  query: z.string().min(1).max(200),
  displayName: z.string().min(1).max(512),
  packageId: z.string().min(3).max(256),
  category: z.string().max(120).optional(),
  iconUrl: z.string().url().max(2048).optional().nullable(),
  countries: z.array(z.string().min(2).max(8)).min(1).max(8),
  analysis: competitorAnalysisPayloadSchema,
});

export type SaveCompetitorAnalysisBody = z.infer<typeof saveCompetitorAnalysisBodySchema>;
