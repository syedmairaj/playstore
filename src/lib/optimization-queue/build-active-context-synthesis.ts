import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";
import { filterQueueForActiveContextDisplay } from "@/lib/competitor-spy/strength-audit-ssot";
import {
  readGrowthStrategyTag,
  readImpactPercent,
} from "@/lib/review-insights/growth-strategy-tags";
import {
  clusterToSynthesisBucket,
  resolveSignalCluster,
  type SignalCluster,
} from "@/lib/optimization-queue/signal-cluster";

export type ActiveContextSynthesisSignal = {
  id: string;
  label: string;
  type: string;
  signalCluster: SignalCluster;
  source?: string;
  impactPercent?: number;
  growthStrategyTag?: "product_improvement" | "oppositional_target";
  competitorName?: string;
  /** market_dominating | user_appreciated — Competitor Strengths ROI taxonomy */
  strengthClass?: "market_dominating" | "user_appreciated";
  coreDifferentiator?: boolean;
  conversionImpactScore?: number;
};

/** Cluster-to-Generate LLM payload (offensive / defensive / market). */
export type ClusterSynthesisPayload = {
  offensive: ActiveContextSynthesisSignal[];
  defensive: ActiveContextSynthesisSignal[];
  market: ActiveContextSynthesisSignal[];
};

/** @deprecated Use ClusterSynthesisPayload — alias for migration. */
export type ActiveContextSynthesisPayload = ClusterSynthesisPayload;

function emptyPayload(): ClusterSynthesisPayload {
  return { offensive: [], defensive: [], market: [] };
}

function toSignal(
  item: OptimizationQueueItem,
  cluster: SignalCluster,
): ActiveContextSynthesisSignal {
  const meta = item.metadata ?? {};
  const growthStrategyTag = readGrowthStrategyTag(meta);
  const impactPercent = readImpactPercent(meta);
  const competitorName =
    typeof meta.competitor_name === "string" && meta.competitor_name.trim()
      ? meta.competitor_name.trim()
      : undefined;

  const strengthClassRaw = meta.strength_class ?? meta.praise_class;
  const strengthClass =
    strengthClassRaw === "market_dominating" || strengthClassRaw === "user_appreciated"
      ? strengthClassRaw
      : undefined;
  const coreDifferentiator =
    meta.core_differentiator === true ? true : undefined;
  const conversionImpactScore =
    typeof meta.conversion_impact_score === "number" &&
    Number.isFinite(meta.conversion_impact_score)
      ? Math.round(meta.conversion_impact_score)
      : undefined;

  return {
    id: item.id,
    label: item.content.trim(),
    type: item.type,
    signalCluster: cluster,
    source: item.source,
    ...(impactPercent != null ? { impactPercent } : {}),
    ...(growthStrategyTag ? { growthStrategyTag } : {}),
    ...(competitorName ? { competitorName } : {}),
    ...(strengthClass ? { strengthClass } : {}),
    ...(coreDifferentiator ? { coreDifferentiator } : {}),
    ...(conversionImpactScore != null ? { conversionImpactScore } : {}),
  };
}

/**
 * Maps curated optimization_queue items → cluster buckets for LLM synthesis.
 * Keyword Tracker rows are excluded (handled via trackedKeywordSignals).
 */
export function buildActiveContextSynthesis(
  items: OptimizationQueueItem[],
): ClusterSynthesisPayload {
  const payload = emptyPayload();
  const visibleItems = filterQueueForActiveContextDisplay(items);

  for (const item of visibleItems) {
    const label = item.content.trim();
    if (!label) continue;

    const cluster = resolveSignalCluster(item);
    if (!cluster) continue;

    const signal = toSignal(item, cluster);
    payload[clusterToSynthesisBucket(cluster)].push(signal);
  }

  return payload;
}

export function activeContextHasSignals(payload: ClusterSynthesisPayload): boolean {
  return (
    payload.offensive.length > 0 ||
    payload.defensive.length > 0 ||
    payload.market.length > 0
  );
}
