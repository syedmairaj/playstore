import "server-only";

import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  OPTIMIZER_CONTEXT_MAX_SIGNALS,
  pruneContext,
  pruneSynthesisToTopSignals,
} from "@/lib/optimizer/prune-context";
import type { ModularPhaseGuardStep } from "@/lib/listing/modular-phase-guard";

const EMPTY_SYNTHESIS: ClusterSynthesisPayload = {
  offensive: [],
  defensive: [],
  market: [],
};

function dedupeKeywords(
  signals: NonNullable<ListingOptimizerInput["trackedKeywordSignals"]>,
): NonNullable<ListingOptimizerInput["trackedKeywordSignals"]> {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = signal.keyword.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSynthesisLabels(payload: ClusterSynthesisPayload): ClusterSynthesisPayload {
  const seen = new Set<string>();
  const dedupeBucket = (
    rows: ClusterSynthesisPayload["offensive"],
  ): ClusterSynthesisPayload["offensive"] => {
    const next: ClusterSynthesisPayload["offensive"] = [];
    for (const signal of rows) {
      const label = signal.label.trim().toLowerCase();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      next.push(signal);
    }
    return next;
  };

  return {
    offensive: dedupeBucket(payload.offensive),
    defensive: dedupeBucket(payload.defensive),
    market: dedupeBucket(payload.market),
  };
}

/**
 * Lazy-load pattern: inject only the signal surface required for the active step.
 * `trackedKeywordSignals` must be hydrated from Context Gateway (`stampAndCompileListingContext`)
 * in the orchestrator before this runs — empty body signals are backfilled from stamped DB rows.
 */
export function applyModularStepSignals(
  input: ListingOptimizerInput,
  step: ModularPhaseGuardStep,
): ListingOptimizerInput {
  let next: ListingOptimizerInput = { ...input };

  if (next.trackedKeywordSignals?.length) {
    next.trackedKeywordSignals = dedupeKeywords(next.trackedKeywordSignals).slice(
      0,
      OPTIMIZER_CONTEXT_MAX_SIGNALS,
    );
  }

  if (step === "title") {
    return {
      ...next,
      activeContext: EMPTY_SYNTHESIS,
      topStagedIssues: undefined,
      exploitTargets: undefined,
      activeSignalTypes: next.activeSignalTypes
        ?.filter((t) => t === "keywords")
        .slice(0, 3),
    };
  }

  if (step === "short") {
    const scoped = next.activeContext
      ? dedupeSynthesisLabels(
          pruneSynthesisToTopSignals(next.activeContext, 3),
        )
      : EMPTY_SYNTHESIS;
    return {
      ...next,
      activeContext: {
        offensive: scoped.offensive.slice(0, 2),
        defensive: scoped.defensive.slice(0, 1),
        market: scoped.market.slice(0, 1),
      },
      topStagedIssues: next.topStagedIssues?.slice(0, 2),
      exploitTargets: next.exploitTargets?.slice(0, 2),
    };
  }

  if (next.activeContext) {
    next.activeContext = dedupeSynthesisLabels(
      pruneSynthesisToTopSignals(next.activeContext, OPTIMIZER_CONTEXT_MAX_SIGNALS),
    );
  }

  if (next.topStagedIssues && next.topStagedIssues.length > OPTIMIZER_CONTEXT_MAX_SIGNALS) {
    next.topStagedIssues = next.topStagedIssues.slice(0, OPTIMIZER_CONTEXT_MAX_SIGNALS);
  }

  return pruneContext(next);
}
