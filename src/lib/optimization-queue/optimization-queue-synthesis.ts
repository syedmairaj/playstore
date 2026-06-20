import type {
  OptimizationQueueItem,
  OptimizationQueueSynthesisPayload,
} from "@/lib/optimization-queue/optimization-queue.types";
import {
  buildActiveContextSynthesis,
  type ActiveContextSynthesisPayload,
} from "@/lib/optimization-queue/build-active-context-synthesis";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import {
  resolveActiveContextStrategyMode,
  topStagedIssuesByImpact,
} from "@/lib/optimization-queue/resolve-strategy-mode";
import {
  readGrowthStrategyTag,
  readImpactPercent,
} from "@/lib/review-insights/growth-strategy-tags";
import { prioritizeAndLimitSignals } from "@/lib/optimizer/context-adapter";

export type { ClusterSynthesisPayload, ActiveContextSynthesisPayload, ActiveContextSynthesisSignal } from "@/lib/optimization-queue/build-active-context-synthesis";
export { buildActiveContextSynthesis, activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";

function metaString(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Maps curated queue items → listing generate API fields.
 * Generate Full Listing must use ONLY this output.
 */
export function buildSynthesisFromOptimizationQueue(
  items: OptimizationQueueItem[],
  seedKeywords: string[] = [],
  options?: { includeOptimizerContext?: boolean },
): OptimizationQueueSynthesisPayload {
  const includeOptimizerContext = options?.includeOptimizerContext !== false;
  const curatedItems = includeOptimizerContext
    ? prioritizeAndLimitSignals(items)
    : [];
  const activeContext = buildActiveContextSynthesis(curatedItems);
  const trackedKeywordSignals: OptimizationQueueSynthesisPayload["trackedKeywordSignals"] = [];
  const exploitTargets: string[] = [];
  const reviewIssueLabels: string[] = [];
  const competitorWeaknesses: string[] = [];
  const reviewStagedSignals: OptimizationQueueSynthesisPayload["reviewStagedSignals"] = [];
  const mergedKeywordSet = new Set<string>();

  for (const item of curatedItems) {
    const term = item.content.trim();
    if (!term) continue;

    const category = resolveQueueItemCategory(item);
    const meta = item.metadata ?? {};

    switch (category) {
      case "tracker": {
        mergedKeywordSet.add(term);
        trackedKeywordSignals.push({
          keyword: term,
          confidence:
            typeof meta.confidence === "number" && Number.isFinite(meta.confidence)
              ? meta.confidence
              : 0,
          difficulty:
            typeof meta.difficulty === "number" ? meta.difficulty : undefined,
          searchVolume:
            typeof meta.searchVolume === "number"
              ? meta.searchVolume
              : typeof meta.search_volume === "number"
                ? meta.search_volume
                : undefined,
          liveRankSummary: metaString(meta, "liveRankSummary"),
        });
        break;
      }
      case "opportunity": {
        mergedKeywordSet.add(term);
        exploitTargets.push(
          term.startsWith("market_spotlight:") ? term : `market_spotlight:${term}`,
        );
        break;
      }
      case "review": {
        const growthStrategyTag = readGrowthStrategyTag(meta);
        const impactPercent = readImpactPercent(meta);
        reviewStagedSignals.push({
          label: term,
          impactPercent,
          growthStrategyTag,
        });
        reviewIssueLabels.push(term);
        break;
      }
      case "strength": {
        competitorWeaknesses.push(term);
        break;
      }
      default:
        break;
    }
  }

  for (const kw of seedKeywords) {
    const t = kw.trim();
    if (t) mergedKeywordSet.add(t);
  }

  for (const signal of activeContext.defensive) {
    if (!competitorWeaknesses.includes(signal.label)) {
      competitorWeaknesses.push(signal.label);
    }
  }

  const activeSignalTypes: OptimizationQueueSynthesisPayload["activeSignalTypes"] = [];
  if (trackedKeywordSignals.length > 0 || mergedKeywordSet.size > 0) {
    activeSignalTypes.push("keywords");
  }
  if (activeContext.defensive.some((s) => s.type === "review_pain_point" || s.type === "feature_request")) {
    activeSignalTypes.push("reviews");
  }
  if (activeContext.market.length > 0) activeSignalTypes.push("market");
  if (activeContext.offensive.length > 0 || activeContext.defensive.length > 0) {
    activeSignalTypes.push("competitors");
  }

  return {
    activeContext,
    trackedKeywordSignals,
    exploitTargets,
    reviewIssueLabels,
    competitorWeaknesses,
    reviewStagedSignals,
    strategyMode: resolveActiveContextStrategyMode(reviewStagedSignals),
    topStagedIssues: topStagedIssuesByImpact(reviewStagedSignals, 3),
    mergedKeywords: [...mergedKeywordSet].slice(0, 40),
    activeSignalTypes,
    userInstructionParts: [],
  };
}
