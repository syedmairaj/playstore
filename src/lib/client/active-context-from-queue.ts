/**
 * Active Context UI partition — Cluster-to-Generate buckets from optimization_queue.
 */

import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import {
  isActiveContextCompetitorStrength,
} from "@/lib/competitor-spy/competitor-strength-lifecycle";
import {
  filterQueueForActiveContextDisplay,
} from "@/lib/competitor-spy/strength-audit-ssot";
import {
  clusterToSynthesisBucket,
  resolveSignalCluster,
  type SignalCluster,
} from "@/lib/optimization-queue/signal-cluster";
import {
  partitionQueueItemsByCategory,
  toTypedActiveContextSignal,
  type TypedActiveContextSignal,
} from "@/lib/staging/optimizer-context-adapter";

export type ActiveContextQueuePill = {
  id: string;
  label: string;
  source: "optimization_queue";
  signalCluster: SignalCluster | null;
  item: TypedActiveContextSignal;
};

export type PartitionedActiveContextQueue = {
  /** Cluster-to-Generate buckets (primary fetcher contract). */
  offensive: ActiveContextQueuePill[];
  defensive: ActiveContextQueuePill[];
  market: ActiveContextQueuePill[];
  trackerItems: OptimizationQueueItem[];
  all: OptimizationQueueItem[];
  /** UI pillar aliases — derived from cluster buckets. */
  reviewPills: ActiveContextQueuePill[];
  marketIntelPills: ActiveContextQueuePill[];
  competitorSpyPills: ActiveContextQueuePill[];
};

/** True when the queue row originated from Competitor Spy (any type). */
export function isCompetitorSpyQueueItem(
  item: Pick<OptimizationQueueItem, "source" | "type" | "metadata">,
): boolean {
  if (item.source === "competitor_spy") return true;

  const origin = String(
    item.metadata?.origin_module ?? item.metadata?.source_origin ?? "",
  ).toLowerCase();

  if (origin === "competitor_spy") return true;

  return (
    item.type === "competitor_keyword" ||
    item.type === "competitor_weakness" ||
    item.type === "competitor_strength"
  );
}

function toPill(item: OptimizationQueueItem): ActiveContextQueuePill {
  const typed = toTypedActiveContextSignal(item);
  const cluster = resolveSignalCluster(item);
  const label =
    cluster === "MARKET_INTEL" || item.source === "market_intel"
      ? item.content.replace(/^market_spotlight:/, "")
      : item.content;

  return {
    id: item.id,
    label,
    source: "optimization_queue",
    signalCluster: cluster,
    item: typed,
  };
}

function isReviewPill(pill: ActiveContextQueuePill): boolean {
  const type = pill.item.type;
  return type === "review_pain_point" || type === "feature_request";
}

/**
 * Competitor Spy gap / quick-win keywords staged into the optimization queue.
 * These feed Competitive Defense (ASO: keyword-gap opportunities) alongside
 * audit-approved ACTIVE competitor strengths.
 */
export function isCompetitorGapOpportunityItem(
  item: Pick<OptimizationQueueItem, "type" | "metadata">,
): boolean {
  if (item.type !== "competitor_keyword") return false;
  const meta = item.metadata ?? {};
  return meta.from_gap_analysis === true;
}

/**
 * Partition optimization queue items into Cluster-to-Generate buckets.
 */
export function partitionQueueForActiveContext(
  items: OptimizationQueueItem[],
): PartitionedActiveContextQueue {
  const visibleItems = filterQueueForActiveContextDisplay(items);
  const byCategory = partitionQueueItemsByCategory(visibleItems);

  const offensive: ActiveContextQueuePill[] = [];
  const defensive: ActiveContextQueuePill[] = [];
  const market: ActiveContextQueuePill[] = [];

  for (const item of byCategory.all) {
    const cluster = resolveSignalCluster(item);
    if (!cluster) continue;

    const pill = toPill(item);
    const bucket = clusterToSynthesisBucket(cluster);
    if (bucket === "offensive") offensive.push(pill);
    else if (bucket === "defensive") defensive.push(pill);
    else market.push(pill);
  }

  // Review Insights include both defensive product pains and offensive
  // oppositional targets (Competitive Exploitation / Stage Issue).
  const reviewPills = [...defensive, ...offensive].filter(isReviewPill);
  const marketIntelPills = market;
  /**
   * Competitive Defense chips:
   * - ACTIVE competitor_strength (audit-approved)
   * - competitor_keyword gaps / quick wins (from_gap_analysis)
   */
  const competitorSpyPills = visibleItems
    .filter(
      (item) =>
        isActiveContextCompetitorStrength(item) ||
        isCompetitorGapOpportunityItem(item),
    )
    .map(toPill);

  return {
    offensive,
    defensive,
    market,
    trackerItems: byCategory.tracker,
    all: visibleItems,
    reviewPills,
    marketIntelPills,
    competitorSpyPills,
  };
}
