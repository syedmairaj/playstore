import { z } from "zod";

const toneStyleSchema = z.enum([
  "professional",
  "friendly",
  "bold",
  "minimal",
]);

export const listingOptimizerRequestSchema = z.object({
  appName: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  targetKeywords: z
    .union([z.array(z.string().trim().min(1).max(80)), z.string()])
    .transform((v) => {
      if (Array.isArray(v)) return v;
      return v
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 40);
    })
    .pipe(z.array(z.string()).min(1).max(40)),
  appFeatures: z.string().trim().min(1).max(8000),
  toneStyle: toneStyleSchema,
  targetArabic: z.boolean().optional(),
  userInstruction: z.string().trim().max(2000).optional(),
  /**
   * Competitor pain-point targets staged from the Active Optimization Queue.
   * Each entry is a short label (e.g. "Bug / Crash", "Ads too intrusive") that
   * the prompt builder uses to craft strategic displacement copy.
   */
  exploitTargets: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  trackedKeywordSignals: z
    .array(
      z.object({
        keyword: z.string().trim().min(1).max(80),
        confidence: z.number().min(0).max(100),
        difficulty: z.number().min(0).max(10).optional(),
        searchVolume: z.number().min(0).optional(),
        liveRankSummary: z.string().trim().max(120).optional(),
      }),
    )
    .max(30)
    .optional(),
});

export type ListingOptimizerRequest = z.infer<
  typeof listingOptimizerRequestSchema
>;
