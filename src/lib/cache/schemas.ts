/**
 * SCHEMA VALIDATION FOR CACHE
 * Ensures staging-vault-service.ts compatibility
 *
 * All cached data MUST conform to these schemas.
 * Zod validation prevents runtime type errors.
 */

import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KEYWORD SCHEMA (From staging-vault-service.ts)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const KeywordSchema = z.object({
  term: z.string().min(1),
  category: z.enum(['high_volume', 'intent_based', 'competitor_gap']),
});

export const KeywordsPayloadSchema = z.array(KeywordSchema);

export type KeywordPayload = z.infer<typeof KeywordSchema>;
export type KeywordsPayload = z.infer<typeof KeywordsPayloadSchema>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GEMINI AI INSIGHTS SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const GeminiInsightSchema = z.object({
  insight: z.string(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
  language: z.enum(['en', 'ar']),
  analysisType: z.enum(['competitor', 'market', 'trend', 'recommendation']),
});

export const GeminiInsightsPayloadSchema = z.array(GeminiInsightSchema);

export type GeminiInsight = z.infer<typeof GeminiInsightSchema>;
export type GeminiInsightsPayload = z.infer<typeof GeminiInsightsPayloadSchema>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SERPER SEARCH RESULTS SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SerperResultSchema = z.object({
  title: z.string(),
  link: z.string().url(),
  snippet: z.string(),
  position: z.number().positive(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().nonnegative().optional(),
});

export const SerperSearchResultSchema = z.object({
  searchParameters: z.object({
    q: z.string(),
    type: z.string().optional(),
    engine: z.string().optional(),
  }),
  answerBox: z.record(z.any()).optional(),
  knowledgeGraph: z.record(z.any()).optional(),
  organic: z.array(SerperResultSchema),
  relatedSearches: z.array(z.object({ query: z.string() })).optional(),
  timestamp: z.number(),
});

export type SerperResult = z.infer<typeof SerperResultSchema>;
export type SerperSearchResult = z.infer<typeof SerperSearchResultSchema>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE APP METADATA SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const AppMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  packageId: z.string(),
  category: z.string(),
  rating: z.number().min(0).max(5),
  ratingCount: z.number().nonnegative(),
  installs: z.number().nonnegative(),
  developer: z.string(),
  icon: z.string().url().optional(),
  description: z.string().optional(),
  lastUpdated: z.number(),
  updatedAt: z.date().optional(),
});

export type AppMetadata = z.infer<typeof AppMetadataSchema>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HYBRID COMPETITOR ANALYSIS SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const CompetitorAnalysisSchema = z.object({
  competitorId: z.string(),
  competitorName: z.string(),
  sharedKeywords: z.array(KeywordSchema),
  gapKeywords: z.array(KeywordSchema),
  insights: z.array(GeminiInsightSchema),
  marketPosition: z.object({
    rating: z.number(),
    installs: z.number(),
    category: z.string(),
  }),
  timestamp: z.number(),
});

export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GENERIC CACHE RESPONSE SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const CacheResponseSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: schema,
    source: z.enum(['cache', 'fresh']),
    isStale: z.boolean(),
    age: z.number(),
    message: z.string().optional(),
  });

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHEMA REGISTRY (For easy lookup)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const schemaRegistry = {
  keywords: KeywordsPayloadSchema,
  'gemini-analysis': GeminiInsightsPayloadSchema,
  'serper-results': SerperSearchResultSchema,
  'app-metadata': AppMetadataSchema,
  'competitor-analysis': CompetitorAnalysisSchema,
} as const;

export type SchemaType = keyof typeof schemaRegistry;

/**
 * Get schema by type
 */
export function getSchema(type: string): z.ZodSchema | null {
  return schemaRegistry[type as SchemaType] || null;
}

/**
 * Validate data against schema
 */
export function validateData<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): { valid: true; data: T } | { valid: false; errors: z.ZodError['errors'] } {
  try {
    const validatedData = schema.parse(data);
    return { valid: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors };
    }
    return {
      valid: false,
      errors: [{ code: 'custom', message: 'Unknown validation error', path: [] }],
    };
  }
}
