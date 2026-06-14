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

export interface OptimizationQueueItem {
  id: string;
  type: OptimizationQueueItemType;
  /** Primary Active Context routing key — immutable once staged. */
  category: OptimizationQueueCategory;
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
  mergedKeywords: string[];
  activeSignalTypes: Array<"keywords" | "reviews" | "market" | "competitors">;
  userInstructionParts: string[];
}
