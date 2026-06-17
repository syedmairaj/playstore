import { z } from "zod";

const fieldProposalSchema = z.object({
  value: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(500),
  charCount: z.coerce.number().int().min(0).max(4000),
  keywordDensityPercent: z.coerce.number().min(0).max(15).optional(),
});

const versionSchema = z.object({
  strategy: z.enum(["oppositional", "growth"]),
  label: z.string().min(1).max(120),
  title: fieldProposalSchema,
  shortDescription: fieldProposalSchema,
  fullDescription: fieldProposalSchema.extend({
    keywordDensityPercent: z.coerce.number().min(0).max(15).optional(),
  }),
  whatsNew: fieldProposalSchema.optional(),
});

export const marketCaptureModelOutputSchema = z.object({
  versionA: versionSchema,
  versionB: versionSchema,
});

export type MarketCaptureModelOutput = z.infer<typeof marketCaptureModelOutputSchema>;
