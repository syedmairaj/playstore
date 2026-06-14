import type {
  OptimizationQueueItem,
  OptimizationQueueSynthesisPayload,
} from "@/lib/optimization-queue/optimization-queue.types";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";

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
): OptimizationQueueSynthesisPayload {
  const trackedKeywordSignals: OptimizationQueueSynthesisPayload["trackedKeywordSignals"] = [];
  const exploitTargets: string[] = [];
  const reviewIssueLabels: string[] = [];
  const competitorWeaknesses: string[] = [];
  const mergedKeywordSet = new Set<string>();

  for (const item of items) {
    const term = item.content.trim();
    if (!term) continue;

    const category = resolveQueueItemCategory(item);

    switch (category) {
      case "tracker": {
        mergedKeywordSet.add(term);
        trackedKeywordSignals.push({
          keyword: term,
          confidence:
            typeof item.metadata.confidence === "number"
              ? item.metadata.confidence
              : undefined,
          difficulty:
            typeof item.metadata.difficulty === "number"
              ? item.metadata.difficulty
              : undefined,
          searchVolume:
            typeof item.metadata.searchVolume === "number"
              ? item.metadata.searchVolume
              : typeof item.metadata.search_volume === "number"
                ? item.metadata.search_volume
                : undefined,
          liveRankSummary: metaString(item.metadata, "liveRankSummary"),
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

  const activeSignalTypes: OptimizationQueueSynthesisPayload["activeSignalTypes"] = [];
  if (trackedKeywordSignals.length > 0 || mergedKeywordSet.size > 0) {
    activeSignalTypes.push("keywords");
  }
  if (reviewIssueLabels.length > 0) activeSignalTypes.push("reviews");
  if (exploitTargets.length > 0) activeSignalTypes.push("market");
  if (competitorWeaknesses.length > 0) activeSignalTypes.push("competitors");

  const userInstructionParts: string[] = [];
  if (competitorWeaknesses.length > 0) {
    userInstructionParts.push(
      `Tracked competitor analysis has surfaced the following active user pain-points across rival apps: ${competitorWeaknesses.join("; ")}. DO NOT mention these issues literally in the listing. Instead, aggressively position our app as the definitive solution — emphasise stability, accuracy, seamless synchronisation, and a clean ad-free experience that directly resolves each of these rival weaknesses.`,
    );
  }

  return {
    trackedKeywordSignals,
    exploitTargets,
    reviewIssueLabels,
    competitorWeaknesses,
    mergedKeywords: [...mergedKeywordSet].slice(0, 40),
    activeSignalTypes,
    userInstructionParts,
  };
}
