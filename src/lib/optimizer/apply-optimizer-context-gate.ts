import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { OptimizedContextResult } from "@/lib/optimizer/context-adapter";
import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";
import { mergeTrackedKeywordSignals } from "@/lib/listing/merge-request-keyword-signals";

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

function mergeKeywordSignalsForInput(
  listingInput: GatedListingInput,
  vaultSignals?: ListingOptimizerInput["trackedKeywordSignals"],
): ListingOptimizerInput["trackedKeywordSignals"] {
  const merged = mergeTrackedKeywordSignals({
    vault: vaultSignals,
    body: listingInput.trackedKeywordSignals,
    targetKeywords: listingInput.targetKeywords,
  });
  return merged.length > 0 ? merged : undefined;
}

function withKeywordsActiveSignalType(
  listingInput: GatedListingInput,
  trackedKeywordSignals: ListingOptimizerInput["trackedKeywordSignals"],
  fetchedTypes?: GatedListingInput["activeSignalTypes"],
): GatedListingInput["activeSignalTypes"] {
  const types = new Set(fetchedTypes ?? listingInput.activeSignalTypes ?? []);
  if ((trackedKeywordSignals?.length ?? 0) > 0) {
    types.add("keywords");
  }
  return types.size > 0 ? Array.from(types) : undefined;
}

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
    const trackedKeywordSignals = mergeKeywordSignalsForInput(listingInput);
    return {
      ...listingInput,
      activeContext: listingInput.activeContext ?? EMPTY_CONTEXT,
      trackedKeywordSignals,
      exploitTargets: listingInput.exploitTargets,
      topStagedIssues: listingInput.topStagedIssues,
      activeSignalTypes: withKeywordsActiveSignalType(
        listingInput,
        trackedKeywordSignals,
      ),
    };
  }

  const trackedKeywordSignals = mergeKeywordSignalsForInput(
    listingInput,
    fetched.trackedKeywordSignals,
  );
  const fetchedExploitTargets = fetched.items
    .filter((item) => item.category === "opportunity")
    .map((item) => item.content.trim())
    .slice(0, 5);

  return {
    ...listingInput,
    activeContext: fetched.synthesis,
    trackedKeywordSignals,
    exploitTargets:
      fetchedExploitTargets.length > 0
        ? fetchedExploitTargets
        : listingInput.exploitTargets,
    topStagedIssues:
      fetched.topStagedIssues.length > 0
        ? fetched.topStagedIssues
        : listingInput.topStagedIssues,
    activeSignalTypes: withKeywordsActiveSignalType(
      listingInput,
      trackedKeywordSignals,
      fetched.activeSignalTypes,
    ),
  };
}
