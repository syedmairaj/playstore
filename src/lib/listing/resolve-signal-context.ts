import "server-only";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import type {
  BrandKitSignal,
  GenerationSignalContext,
} from "@/lib/listing/generation-signal-context.types";

/**
 * Builds the unified `GenerationSignalContext` from:
 *  - `brandKit`          — fetched from DB (see `fetchWorkspaceBrandKit`)
 *  - all other signals   — derived from the already-hydrated `ListingOptimizerInput`
 *
 * This is called once in the executor, before `runListingGenerationOrchestrator`.
 */
export function resolveSignalContext(
  input: ListingOptimizerInput,
  brandKit: BrandKitSignal,
): GenerationSignalContext {
  const marketSignals = input.activeContext?.market ?? [];
  const offensiveSignals = input.activeContext?.offensive ?? [];
  const topIssues = input.topStagedIssues ?? [];
  const tracked = input.trackedKeywordSignals ?? [];
  const exploitTargets = input.exploitTargets ?? [];

  return {
    brandKit,
    marketIntel: {
      gaps: marketSignals
        .map((s) => s.label)
        .filter(Boolean)
        .slice(0, 5),
      trends: [],
    },
    reviews: {
      topPainPoints: topIssues
        .map((i) => i.label)
        .filter(Boolean)
        .slice(0, 4),
      positiveHighlights: [],
    },
    keywordTracker: {
      highConfidenceKeywords: tracked
        .filter((k) => k.confidence >= 70)
        .map((k) => k.keyword)
        .slice(0, 8),
      opportunityKeywords: tracked
        .filter((k) => k.confidence < 70)
        .map((k) => k.keyword)
        .slice(0, 5),
    },
    competitorSignals: {
      weaknesses: offensiveSignals
        .map((s) => s.label)
        .filter(Boolean)
        .slice(0, 3),
      differentiators: exploitTargets.slice(0, 3),
    },
  };
}
