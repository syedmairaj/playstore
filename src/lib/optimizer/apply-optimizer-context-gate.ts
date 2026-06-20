import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { OptimizedContextResult } from "@/lib/optimizer/context-adapter";
import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";

const EMPTY_CONTEXT: ClusterSynthesisPayload = {
  offensive: [],
  defensive: [],
  market: [],
};

type GatedListingInput = ListingOptimizerInput & {
  activeContext?: ClusterSynthesisPayload;
  trackedKeywordSignals?: ListingOptimizerInput["trackedKeywordSignals"];
  exploitTargets?: string[];
  topStagedIssues?: ListingOptimizerInput["topStagedIssues"];
  activeSignalTypes?: Array<"reviews" | "market" | "competitors" | "keywords">;
};

/**
 * Merge lazy-fetched optimizer context into listing input.
 * Client-supplied activeContext is ignored when server fetch is provided.
 */
export function applyOptimizerContextGate(
  listingInput: GatedListingInput,
  includeOptimizerContext: boolean,
  fetched?: OptimizedContextResult | null,
): GatedListingInput {
  if (!includeOptimizerContext) {
    return {
      ...listingInput,
      activeContext: undefined,
      trackedKeywordSignals: undefined,
      exploitTargets: undefined,
      topStagedIssues: undefined,
      activeSignalTypes: undefined,
    };
  }

  if (!fetched) {
    return {
      ...listingInput,
      activeContext: EMPTY_CONTEXT,
      trackedKeywordSignals: undefined,
      exploitTargets: undefined,
      topStagedIssues: undefined,
      activeSignalTypes: undefined,
    };
  }

  return {
    ...listingInput,
    activeContext: fetched.synthesis,
    trackedKeywordSignals:
      fetched.trackedKeywordSignals.length > 0
        ? fetched.trackedKeywordSignals
        : undefined,
    exploitTargets: fetched.items
      .filter((item) => item.category === "opportunity")
      .map((item) => item.content.trim())
      .slice(0, 5),
    topStagedIssues:
      fetched.topStagedIssues.length > 0 ? fetched.topStagedIssues : undefined,
    activeSignalTypes:
      fetched.activeSignalTypes.length > 0 ? fetched.activeSignalTypes : undefined,
  };
}
