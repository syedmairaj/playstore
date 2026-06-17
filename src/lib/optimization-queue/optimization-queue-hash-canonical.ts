import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue/optimization-queue.types";
import { isReviewDerivedQueueItem } from "@/lib/optimization-queue/review-derived-queue-filter";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import { resolveSignalCluster } from "@/lib/optimization-queue/signal-cluster";
import { readSignalLifecycleStatus } from "@/lib/signals/signal-lifecycle";
import {
  readGrowthStrategyTag,
  readImpactPercent,
} from "@/lib/review-insights/growth-strategy-tags";

/** Keep in sync with optimization_queue MAX_CONTENT_LEN. */
const HASH_CONTENT_MAX_LEN = 500;

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

function readMetaNumber(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Stable per-item fingerprint — uses the same SSOT resolvers as vault slim/read paths
 * so client React state and server DB reads hash identically.
 */
export function queueItemFingerprint(item: OptimizationQueueItem): QueueHashFingerprint {
  const category = resolveQueueItemCategory(item);
  const meta = item.metadata ?? {};
  const signalCluster =
    resolveSignalCluster({
      ...item,
      category,
      metadata: meta,
    }) ?? null;
  const status = readSignalLifecycleStatus(item) ?? null;
  const strengthClassRaw = meta.strength_class ?? meta.praise_class;
  const strengthClass =
    strengthClassRaw === "market_dominating" || strengthClassRaw === "user_appreciated"
      ? strengthClassRaw
      : null;
  const impactPercent = readImpactPercent(meta);
  const conversionRaw = readMetaNumber(meta, "conversion_impact_score");

  return {
    id: item.id,
    type: item.type,
    category,
    status,
    content: item.content.trim().slice(0, HASH_CONTENT_MAX_LEN),
    source: item.source,
    signalCluster,
    impactPercent: impactPercent ?? null,
    growthStrategyTag: readGrowthStrategyTag(meta),
    strengthClass,
    coreDifferentiator: meta.core_differentiator === true ? true : null,
    conversionImpactScore:
      conversionRaw != null ? Math.min(100, Math.max(0, Math.round(conversionRaw))) : null,
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
