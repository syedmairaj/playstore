import "server-only";

import type { ContextPackageV1 } from "@/lib/listing/context-package.types";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";
import { pruneContext } from "@/lib/optimizer/prune-context";
import { mergeTrackedKeywordSignals } from "@/lib/listing/merge-request-keyword-signals";

const EMPTY_SYNTHESIS: ClusterSynthesisPayload = {
  offensive: [],
  defensive: [],
  market: [],
};

/**
 * Safety toggle — set `USE_OPTIMIZED_PIPELINE=true` to enable Redis Context Package synthesis.
 * Defaults to legacy vault fetch path when unset or false.
 */
export function useOptimizedPipeline(): boolean {
  return process.env.USE_OPTIMIZED_PIPELINE === "true";
}

/**
 * Apply the pre-computed 5-point Context Package to listing input (signal compression).
 */
export function optimizedSynthesis(
  input: ListingOptimizerInput,
  pkg: ContextPackageV1,
): ListingOptimizerInput {
  const compressedInstruction = pkg.signalPoints
    .map((p, i) => `${i + 1}. [${p.category}] ${p.label}`)
    .join("\n");

  const trackedKeywordSignals = mergeTrackedKeywordSignals({
    vault: pkg.trackedKeywordSignals,
    body: input.trackedKeywordSignals,
    targetKeywords: input.targetKeywords,
  });

  const next: ListingOptimizerInput = {
    ...input,
    activeContext: pkg.synthesis,
    trackedKeywordSignals:
      trackedKeywordSignals.length > 0 ? trackedKeywordSignals : undefined,
    topStagedIssues:
      pkg.topStagedIssues.length > 0 ? pkg.topStagedIssues : undefined,
    activeSignalTypes:
      pkg.activeSignalTypes.length > 0 ? pkg.activeSignalTypes : undefined,
    exploitTargets: pkg.signalPoints
      .filter((p) => p.category === "market")
      .map((p) => p.label)
      .slice(0, 5),
    userInstruction: [
      input.userInstruction?.trim(),
      compressedInstruction
        ? `COMPRESSED CONTEXT PACKAGE (top ${pkg.signalPoints.length} signals):\n${compressedInstruction}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  return pruneContext(next);
}

/** Legacy path — uses already-gated listing input from vault fetch (unchanged). */
export function legacySynthesis(input: ListingOptimizerInput): ListingOptimizerInput {
  const trackedKeywordSignals = mergeTrackedKeywordSignals({
    body: input.trackedKeywordSignals,
    targetKeywords: input.targetKeywords,
  });
  return pruneContext({
    ...input,
    trackedKeywordSignals:
      trackedKeywordSignals.length > 0 ? trackedKeywordSignals : input.trackedKeywordSignals,
  });
}

export type ListingGenerationAdapterResult = {
  input: ListingOptimizerInput;
  pipeline: "optimized" | "legacy";
  contextPackage?: ContextPackageV1;
};

export function applyListingGenerationAdapter(args: {
  input: ListingOptimizerInput;
  pipeline: "optimized" | "legacy";
  contextPackage?: ContextPackageV1 | null;
}): ListingGenerationAdapterResult {
  if (args.pipeline === "optimized" && args.contextPackage) {
    return {
      input: optimizedSynthesis(args.input, args.contextPackage),
      pipeline: "optimized",
      contextPackage: args.contextPackage,
    };
  }

  return {
    input: legacySynthesis(args.input),
    pipeline: "legacy",
  };
}
