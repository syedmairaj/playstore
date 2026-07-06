import type { ClusterSynthesisPayload } from "@/lib/optimization-queue/build-active-context-synthesis";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

/** Five highest-impact signals compressed for generation (EN/AR). */
export type ContextPackageSignalPoint = {
  category: "keywords" | "competitors" | "reviews" | "market";
  label: string;
  source: string;
  impactScore: number;
};

export type ContextPackageV1 = {
  version: "1";
  workspaceId: string;
  appId: string | null;
  locale: OptimizationQueueLocale;
  queueHash: string;
  compressedAt: string;
  /** Max 5 impact-ranked signal points. */
  signalPoints: ContextPackageSignalPoint[];
  synthesis: ClusterSynthesisPayload;
  trackedKeywordSignals: Array<{
    keyword: string;
    confidence: number;
    difficulty?: number;
    searchVolume?: number;
    liveRankSummary?: string;
  }>;
  topStagedIssues: Array<{
    label: string;
    impactPercent?: number;
    growthStrategyTag: "product_improvement" | "oppositional_target";
  }>;
  activeSignalTypes: Array<"reviews" | "market" | "competitors" | "keywords">;
};

export const CONTEXT_PACKAGE_MAX_SIGNALS = 5;
export const CONTEXT_PACKAGE_TTL_SECONDS = 60 * 60 * 24; // 24h
