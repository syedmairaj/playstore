import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue/optimization-queue.types";
import { isReviewDerivedQueueItem } from "@/lib/optimization-queue/review-derived-queue-filter";

export type QueueHashFingerprint = {
  id: string;
  type: string;
  category: string;
  status: string | null;
  content: string;
  source: string;
  signalCluster: string | null;
  impactPercent: number | null;
  growthStrategyTag: string | null;
  strengthClass: string | null;
  coreDifferentiator: boolean | null;
  conversionImpactScore: number | null;
};

function readMetaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readMetaNumber(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Stable per-item fingerprint — must match on client and server. */
export function queueItemFingerprint(item: OptimizationQueueItem): QueueHashFingerprint {
  const meta = item.metadata ?? {};
  const strengthClassRaw = meta.strength_class ?? meta.praise_class;
  const strengthClass =
    strengthClassRaw === "market_dominating" || strengthClassRaw === "user_appreciated"
      ? strengthClassRaw
      : null;

  return {
    id: item.id,
    type: item.type,
    category: item.category,
    status: item.status ?? null,
    content: item.content.trim(),
    source: item.source,
    signalCluster: item.signalCluster ?? null,
    impactPercent: readMetaNumber(meta, "impact_percent"),
    growthStrategyTag: readMetaString(meta, "growth_strategy_tag"),
    strengthClass,
    coreDifferentiator: meta.core_differentiator === true ? true : null,
    conversionImpactScore: readMetaNumber(meta, "conversion_impact_score"),
  };
}

/**
 * Items included in Active Context queue hash — mirrors `readOptimizationQueue`.
 */
export function filterItemsForActiveContextQueueHash(
  items: OptimizationQueueItem[],
  locale: OptimizationQueueLocale,
): OptimizationQueueItem[] {
  return items
    .filter((item) => item.language === locale)
    .filter((item) => !isReviewDerivedQueueItem(item));
}

export function buildActiveContextQueueHashCanonical(
  items: OptimizationQueueItem[],
  locale: OptimizationQueueLocale,
): string {
  const fingerprints = filterItemsForActiveContextQueueHash(items, locale)
    .map(queueItemFingerprint)
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify(fingerprints);
}
