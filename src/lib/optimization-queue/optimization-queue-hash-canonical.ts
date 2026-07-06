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
 * Items included in the Active Context queue hash — mirrors the filter applied
 * by `readOptimizationQueue` on the server so client and server hashes are
 * always computed over the same item set.
 *
 * ## Three-module consistency guarantee
 *
 * All three intel modules contribute to the hash and any change to their items
 * will cause a new hash:
 *
 * - **Competitor Spy** (`source: "competitor_spy"`) — competitor_strength /
 *   competitor_keyword / competitor_weakness items. All types are included.
 *   Lifecycle-status transitions (DISCOVERY → AUDIT → ACTIVE) are captured via
 *   `queueItemFingerprint.status`, so promoting a Spy signal changes the hash.
 *
 * - **Review Insights** (`source: "review_analysis"`) — review_pain_point items
 *   that have been explicitly staged (adopted, backlog-linked, or manually moved
 *   to active context) are included. Auto-derived review_pain_point items that
 *   the user has not yet curated (`review_derived: true` without explicit staging)
 *   are intentionally excluded via `isReviewDerivedQueueItem` — they are
 *   suggestions in DISCOVERY state, not curated signals.
 *
 * - **Market Intel** (`source: "market_intel"`) — market_keyword items. All are
 *   included; lifecycle-status transitions change the hash.
 *
 * The DISCOVERY lifecycle status is included in each item's fingerprint, so
 * promoting any item (DISCOVERY → AUDIT / ACTIVE) invalidates the hash and
 * forces the client to re-hash before generating.
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
