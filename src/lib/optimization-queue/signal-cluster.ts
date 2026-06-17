/**
 * Cluster-to-Generate taxonomy — every non-tracker queue item maps to exactly one cluster.
 */

import type {
  AddOptimizationQueueInput,
  OptimizationQueueItem,
} from "@/lib/optimization-queue/optimization-queue.types";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import { isCompetitorSpyQueueItem } from "@/lib/client/active-context-from-queue";
import { GROWTH_STRATEGY_TAG, readGrowthStrategyTag } from "@/lib/review-insights/growth-strategy-tags";

export const SIGNAL_CLUSTERS = [
  "OFFENSIVE_GROWTH",
  "DEFENSIVE_PAIN_POINT",
  "MARKET_INTEL",
] as const;

export type SignalCluster = (typeof SIGNAL_CLUSTERS)[number];

export function isSignalCluster(value: unknown): value is SignalCluster {
  return (
    typeof value === "string" &&
    (SIGNAL_CLUSTERS as readonly string[]).includes(value)
  );
}

function isWeaknessItem(
  item: Pick<OptimizationQueueItem, "type" | "metadata">,
): boolean {
  if (item.type === "competitor_weakness") return true;
  const meta = item.metadata ?? {};
  const queueType = String(meta.queue_type ?? "");
  if (queueType === "competitor_weakness" || queueType === "competitor_strength") {
    return true;
  }
  const gapCategory = String(meta.competitor_gap_category ?? "").toLowerCase();
  return gapCategory === "weakness" || gapCategory.includes("weakness");
}

/**
 * Infer cluster from queue item type, source, and metadata (module producers).
 * Returns null for Keyword Tracker rows — excluded from cluster synthesis.
 */
export function inferSignalCluster(
  item: Pick<
    AddOptimizationQueueInput | OptimizationQueueItem,
    "type" | "source" | "category" | "metadata"
  >,
): SignalCluster | null {
  const category =
    item.category ??
    (typeof item.metadata?.category === "string"
      ? (item.metadata.category as OptimizationQueueItem["category"])
      : undefined);

  if (category === "tracker" || item.type === "market_keyword") {
    return null;
  }

  const explicit =
    (item as OptimizationQueueItem).signalCluster ??
    (item.metadata?.signal_cluster as string | undefined) ??
    (item.metadata?.cluster_category as string | undefined);

  if (isSignalCluster(explicit)) return explicit;

  if (item.type === "competitor_keyword") return "OFFENSIVE_GROWTH";
  if (item.type === "competitor_strength") return "OFFENSIVE_GROWTH";
  if (item.type === "competitor_weakness") return "DEFENSIVE_PAIN_POINT";

  if (item.type === "review_pain_point" || item.type === "feature_request") {
    const tag = readGrowthStrategyTag(item.metadata);
    if (tag === GROWTH_STRATEGY_TAG.oppositionalTarget) {
      return "OFFENSIVE_GROWTH";
    }
    return "DEFENSIVE_PAIN_POINT";
  }

  if (item.type === "keyword_gap") {
    if (isCompetitorSpyQueueItem(item as OptimizationQueueItem)) {
      return "OFFENSIVE_GROWTH";
    }
    if (item.source === "market_intel") return "MARKET_INTEL";
    return "MARKET_INTEL";
  }

  const resolvedCategory = category ?? resolveQueueItemCategory(item as OptimizationQueueItem);

  if (resolvedCategory === "review") return "DEFENSIVE_PAIN_POINT";

  if (resolvedCategory === "opportunity") {
    return isCompetitorSpyQueueItem(item as OptimizationQueueItem)
      ? "OFFENSIVE_GROWTH"
      : "MARKET_INTEL";
  }

  if (resolvedCategory === "strength") {
    return isWeaknessItem(item as OptimizationQueueItem)
      ? "DEFENSIVE_PAIN_POINT"
      : "OFFENSIVE_GROWTH";
  }

  return null;
}

export function resolveSignalCluster(
  item: Pick<
    OptimizationQueueItem,
    "type" | "source" | "category" | "metadata" | "signalCluster"
  >,
): SignalCluster | null {
  if (isSignalCluster(item.signalCluster)) return item.signalCluster;
  return inferSignalCluster(item);
}

export function assertSignalCluster(value: unknown): SignalCluster {
  if (!isSignalCluster(value)) {
    throw new Error(
      `Queue item requires signalCluster: OFFENSIVE_GROWTH | DEFENSIVE_PAIN_POINT | MARKET_INTEL (got: ${String(value)})`,
    );
  }
  return value;
}

export class ManualClusterRequiredError extends Error {
  readonly code = "manual_cluster_required" as const;
  constructor() {
    super(
      "Manual queue entries require signalCluster — categorize before staging.",
    );
    this.name = "ManualClusterRequiredError";
  }
}

/** Manual producer rows must declare a cluster (modal / API). */
export function validateManualQueueInput(
  input: AddOptimizationQueueInput,
): void {
  if (input.source !== "manual") return;
  const cluster =
    input.signalCluster ??
    (input.metadata?.signal_cluster as string | undefined) ??
    (input.metadata?.cluster_category as string | undefined);
  if (!isSignalCluster(cluster)) {
    throw new ManualClusterRequiredError();
  }
}

export function withResolvedSignalCluster(
  input: AddOptimizationQueueInput,
): AddOptimizationQueueInput {
  validateManualQueueInput(input);
  const cluster =
    input.signalCluster ??
    (isSignalCluster(input.metadata?.signal_cluster)
      ? input.metadata!.signal_cluster
      : undefined) ??
    (isSignalCluster(input.metadata?.cluster_category)
      ? input.metadata!.cluster_category
      : undefined) ??
    inferSignalCluster(input);

  if (!cluster) return input;

  return {
    ...input,
    signalCluster: cluster,
    metadata: {
      ...(input.metadata ?? {}),
      signal_cluster: cluster,
      cluster_category: cluster,
    },
  };
}

export type ClusterSynthesisBucket = "offensive" | "defensive" | "market";

export function clusterToSynthesisBucket(
  cluster: SignalCluster,
): ClusterSynthesisBucket {
  switch (cluster) {
    case "OFFENSIVE_GROWTH":
      return "offensive";
    case "DEFENSIVE_PAIN_POINT":
      return "defensive";
    case "MARKET_INTEL":
      return "market";
  }
}
