import { z } from "zod";

export const ORCHESTRATION_PROTOCOL_VERSION = "1.0" as const;

export const anchorModuleSchema = z.object({
  moduleId: z.literal("anchor"),
  /** Hybrid title — user-locked keywords woven with AI-suggested terms (≤30 chars). */
  title: z.string().trim().min(1).max(30),
  /** User seed / locked keywords from the form (immutable anchor input). */
  lockedKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  /** AI-suggested terms woven into the title (not verbatim-stuffed). */
  aiSuggestedKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  /** Immutable keyword anchor phrase — phases 2 & 3 MUST reference this. */
  keywordAnchor: z.string().trim().min(1).max(160),
  hybridRationale: z.string().trim().max(400).optional(),
});

export const shortVariationSchema = z.object({
  variationId: z.enum(["defensive", "offensive", "primary"]),
  profileLabel: z.string().trim().min(1).max(80),
  shortDescription: z.string().trim().min(1).max(80),
  rationale: z.string().trim().min(1).max(400),
  reviewInsightsUsed: z.array(z.string().trim().min(1).max(200)).max(3).optional(),
});

export const conversionModuleSchema = z.object({
  moduleId: z.literal("conversion"),
  activeStrategyProfile: z.enum(["defensive", "offensive"]),
  shortVariations: z.array(shortVariationSchema).length(3),
  /** Matches activeStrategyProfile — used as default shortDescription. */
  selectedVariationId: z.enum(["defensive", "offensive", "primary"]),
});

export const expansionHookBlockSchema = z.object({
  blockId: z.literal("hook"),
  painPointLabel: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(1200),
});

export const expansionFeaturesBlockSchema = z.object({
  blockId: z.literal("features"),
  categories: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        bullets: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
      }),
    )
    .min(1)
    .max(6),
});

export const expansionTrustBlockSchema = z.object({
  blockId: z.literal("trustClosing"),
  content: z.string().trim().min(1).max(800),
  cta: z.string().trim().min(1).max(200),
});

export const expansionModuleSchema = z.object({
  moduleId: z.literal("expansion"),
  keywordAnchor: z.string().trim().min(1).max(160),
  blocks: z.object({
    hook: expansionHookBlockSchema,
    features: expansionFeaturesBlockSchema,
    trustClosing: expansionTrustBlockSchema,
  }),
  assembledFullDescription: z.string().trim().min(1).max(4000),
});

export const orchestrationProtocolSchema = z.object({
  protocolVersion: z.literal(ORCHESTRATION_PROTOCOL_VERSION),
  modules: z.object({
    anchor: anchorModuleSchema,
    conversion: conversionModuleSchema,
    expansion: expansionModuleSchema,
  }),
});

export type AnchorModule = z.infer<typeof anchorModuleSchema>;
export type ShortVariation = z.infer<typeof shortVariationSchema>;
export type ConversionModule = z.infer<typeof conversionModuleSchema>;
export type ExpansionModule = z.infer<typeof expansionModuleSchema>;
export type OrchestrationProtocol = z.infer<typeof orchestrationProtocolSchema>;
