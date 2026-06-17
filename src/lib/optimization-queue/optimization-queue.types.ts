import type { SignalCluster } from "@/lib/optimization-queue/signal-cluster";

/** Locale-isolated optimization queue item types (Research → Curate → Synthesize). */

export type OptimizationQueueLocale = "en" | "ar";

/** Active Context section routing key — every queue item MUST resolve to one. */
export type OptimizationQueueCategory = "tracker" | "review" | "opportunity" | "strength";

export type OptimizationQueueItemType =
  | "keyword_gap"
  | "review_pain_point"
  | "feature_request"
  | "competitor_strength"
  | "competitor_keyword"
  | "market_keyword"
  | "competitor_weakness";

/** Canonical Active Context signal types (typed queue model). */
export type ActiveContextSignalType =
  | "keyword_gap"
  | "review_pain_point"
  | "feature_request"
  | "competitor_strength";

export interface TypedActiveContextSignal {
  type: ActiveContextSignalType;
  payload: {
    id: string;
    content: string;
    source: OptimizationQueueSource;
    language: OptimizationQueueLocale;
    stagedAt: string;
    metadata: Record<string, unknown>;
  };
}

export type OptimizationQueueSource =
  | "keyword_tracker"
  | "competitor_spy"
  | "review_analysis"
  | "market_intel"
  | "manual";

export { type SignalCluster, SIGNAL_CLUSTERS } from "@/lib/optimization-queue/signal-cluster";

export interface OptimizationQueueItem {
  id: string;
  type: OptimizationQueueItemType;
  /** Primary Active Context routing key — immutable once staged. */
  category: OptimizationQueueCategory;
  /** Cluster-to-Generate bucket — required for all non-tracker items. */
  signalCluster?: SignalCluster;
  /** Competitor strength lifecycle: DISCOVERY | AUDIT | ACTIVE (vault SSOT). */
  status?: import("@/lib/signals/signal-lifecycle").SignalLifecycleStatus;
  content: string;
  source: OptimizationQueueSource;
  sourceContext?: string;
  sourceContextId?: string;
  language: OptimizationQueueLocale;
  stagedAt: string;
  metadata: Record<string, unknown>;
}

export interface OptimizationQueueState {
  items: OptimizationQueueItem[];
  updatedAt: string;
}

export interface AddOptimizationQueueInput {
  type: OptimizationQueueItemType;
  content: string;
  source: OptimizationQueueSource;
  /** Competitor strength lifecycle when type is competitor_strength. */
  status?: import("@/lib/signals/signal-lifecycle").SignalLifecycleStatus;
  /** Cluster-to-Generate — required when source is manual. */
  signalCluster?: SignalCluster;
  /** Required for routing — inferred server-side when omitted on legacy clients. */
  category?: OptimizationQueueCategory;
  sourceContext?: string;
  sourceContextId?: string;
  metadata?: Record<string, unknown>;
}

export interface OptimizationQueueStats {
  total: number;
  byType: Record<OptimizationQueueItemType, number>;
  lastSyncAt: string;
}

export interface OptimizationQueueSynthesisPayload {
  /** Structured synthesis feedback loop payload for the LLM. */
  activeContext: import("@/lib/optimization-queue/build-active-context-synthesis").ActiveContextSynthesisPayload;
  trackedKeywordSignals: Array<{
    keyword: string;
    confidence?: number;
    difficulty?: number;
    searchVolume?: number;
    liveRankSummary?: string;
  }>;
  exploitTargets: string[];
  reviewIssueLabels: string[];
  competitorWeaknesses: string[];
  reviewStagedSignals: Array<{
    label: string;
    impactPercent?: number;
    growthStrategyTag: "product_improvement" | "oppositional_target";
  }>;
  /** Dominant ASO Growth mode derived from staged review signals. */
  strategyMode: "defensive" | "offensive";
  /** Top 3 staged issues by Impact % — for Strategic Rationale output. */
  topStagedIssues: Array<{
    label: string;
    impactPercent?: number;
    growthStrategyTag: "product_improvement" | "oppositional_target";
  }>;
  mergedKeywords: string[];
  activeSignalTypes: Array<"keywords" | "reviews" | "market" | "competitors">;
  userInstructionParts: string[];
}
