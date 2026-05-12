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
});

export type ListingOptimizerRequest = z.infer<
  typeof listingOptimizerRequestSchema
>;
