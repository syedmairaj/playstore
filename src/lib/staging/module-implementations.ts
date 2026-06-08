/**
 * Module-Specific Staging Implementation Patterns
 *
 * Provides ready-to-use implementations for each module:
 * - Reviews (Common Issues)
 * - Competitor Spy (Snapshot/Weakness cards)
 * - Market Intel (Spotlight cards)
 * - Keyword Tracker (Keyword rows)
 * - Alerts (Alert cards)
 */

import {
  createArchiveStateManager,
  triggerOptimizerSync,
  getLocaleMessage,
  type OnStageSuccessParams,
  type ArchiveStateManager,
} from "./unified-staging-state";

/**
 * REVIEWS MODULE IMPLEMENTATION
 *
 * Handles staging of review issues from "Common Issues" view
 */
export interface ReviewIssueArchiveItem {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  impactPercent: number;
  description: string;
  _archivedAt?: string;
  _archivedReason?: "staged" | "dismissed" | "archived";
}

export interface ReviewsModuleState {
  activeIssues: ReviewIssueArchiveItem[];
  archivedIssues: ReviewIssueArchiveItem[];
  archiveManager: ArchiveStateManager<ReviewIssueArchiveItem>;
}

export function initializeReviewsModuleState(
  initialIssues: ReviewIssueArchiveItem[]
): ReviewsModuleState {
  const activeIssues = initialIssues;
  const archivedIssues: ReviewIssueArchiveItem[] = [];

  const archiveManager = createArchiveStateManager(
    activeIssues,
    (items) => (activeIssues = items),
    archivedIssues,
    (items) => (archivedIssues = items)
  );

  return {
    activeIssues,
    archivedIssues,
    archiveManager,
  };
}

export function createReviewsStageCallback(
  archiveManager: ArchiveStateManager<ReviewIssueArchiveItem>,
  workspaceId: string,
  locale: string,
  optimizerMutate?: (key: string | string[]) => Promise<any>
) {
  return async (params: OnStageSuccessParams) => {
    // Move from active to archive
    archiveManager.moveToArchive(params.payload.signalId, params.reason);

    // Show transition toast
    console.info("[ReviewsModule] Issue moved to archive:", params.payload.signalId);

    // Sync optimizer
    if (optimizerMutate) {
      try {
        await triggerOptimizerSync({
          workspaceId,
          mutate: optimizerMutate,
        });
      } catch (error) {
        console.warn("[ReviewsModule] Optimizer sync failed:", error);
      }
    }
  };
}

/**
 * COMPETITOR SPY MODULE IMPLEMENTATION
 *
 * Handles staging of competitor weaknesses from snapshot cards
 */
export interface CompetitorWeaknessArchiveItem {
  id: string;
  competitorName: string;
  competitorPackageId: string;
  displayName: string;
  categoryLabel: string;
  bestRank: number | null;
  metricsKeywordCount: number;
  _archivedAt?: string;
  _archivedReason?: "staged" | "dismissed" | "archived";
}

export interface CompetitorSpyModuleState {
  activeWeaknesses: CompetitorWeaknessArchiveItem[];
  archivedWeaknesses: CompetitorWeaknessArchiveItem[];
  archiveManager: ArchiveStateManager<CompetitorWeaknessArchiveItem>;
}

export function initializeCompetitorSpyModuleState(
  initialWeaknesses: CompetitorWeaknessArchiveItem[]
): CompetitorSpyModuleState {
  const activeWeaknesses = initialWeaknesses;
  const archivedWeaknesses: CompetitorWeaknessArchiveItem[] = [];

  const archiveManager = createArchiveStateManager(
    activeWeaknesses,
    (items) => (activeWeaknesses = items),
    archivedWeaknesses,
    (items) => (archivedWeaknesses = items)
  );

  return {
    activeWeaknesses,
    archivedWeaknesses,
    archiveManager,
  };
}

export function createCompetitorSpyStageCallback(
  archiveManager: ArchiveStateManager<CompetitorWeaknessArchiveItem>,
  workspaceId: string,
  locale: string,
  optimizerMutate?: (key: string | string[]) => Promise<any>
) {
  return async (params: OnStageSuccessParams) => {
    archiveManager.moveToArchive(params.payload.signalId, params.reason);

    console.info(
      "[CompetitorSpyModule] Weakness moved to archive:",
      params.payload.signalId
    );

    if (optimizerMutate) {
      try {
        await triggerOptimizerSync({
          workspaceId,
          mutate: optimizerMutate,
        });
      } catch (error) {
        console.warn("[CompetitorSpyModule] Optimizer sync failed:", error);
      }
    }
  };
}

/**
 * MARKET INTEL MODULE IMPLEMENTATION
 *
 * Handles staging of trending keywords from spotlight cards
 */
export interface TrendingKeywordArchiveItem {
  id: string;
  keyword: string;
  searchVolume: number;
  difficulty: number;
  trend: "up" | "down" | "stable";
  _archivedAt?: string;
  _archivedReason?: "staged" | "dismissed" | "archived";
}

export interface MarketIntelModuleState {
  activeTrendingKeywords: TrendingKeywordArchiveItem[];
  archivedTrendingKeywords: TrendingKeywordArchiveItem[];
  archiveManager: ArchiveStateManager<TrendingKeywordArchiveItem>;
}

export function initializeMarketIntelModuleState(
  initialKeywords: TrendingKeywordArchiveItem[]
): MarketIntelModuleState {
  const activeTrendingKeywords = initialKeywords;
  const archivedTrendingKeywords: TrendingKeywordArchiveItem[] = [];

  const archiveManager = createArchiveStateManager(
    activeTrendingKeywords,
    (items) => (activeTrendingKeywords = items),
    archivedTrendingKeywords,
    (items) => (archivedTrendingKeywords = items)
  );

  return {
    activeTrendingKeywords,
    archivedTrendingKeywords,
    archiveManager,
  };
}

export function createMarketIntelStageCallback(
  archiveManager: ArchiveStateManager<TrendingKeywordArchiveItem>,
  workspaceId: string,
  locale: string,
  optimizerMutate?: (key: string | string[]) => Promise<any>
) {
  return async (params: OnStageSuccessParams) => {
    archiveManager.moveToArchive(params.payload.signalId, params.reason);

    console.info(
      "[MarketIntelModule] Keyword moved to archive:",
      params.payload.signalId
    );

    if (optimizerMutate) {
      try {
        await triggerOptimizerSync({
          workspaceId,
          mutate: optimizerMutate,
        });
      } catch (error) {
        console.warn("[MarketIntelModule] Optimizer sync failed:", error);
      }
    }
  };
}

/**
 * KEYWORD TRACKER MODULE IMPLEMENTATION
 *
 * Handles staging of keywords from AI suggestions and watchlist
 */
export interface TrackedKeywordArchiveItem {
  id: string;
  keyword: string;
  currentRank: number;
  previousRank?: number;
  searchVolume: number;
  difficulty: number;
  market: string;
  _archivedAt?: string;
  _archivedReason?: "staged" | "dismissed" | "archived";
}

export interface KeywordTrackerModuleState {
  activeKeywords: TrackedKeywordArchiveItem[];
  archivedKeywords: TrackedKeywordArchiveItem[];
  archiveManager: ArchiveStateManager<TrackedKeywordArchiveItem>;
}

export function initializeKeywordTrackerModuleState(
  initialKeywords: TrackedKeywordArchiveItem[]
): KeywordTrackerModuleState {
  const activeKeywords = initialKeywords;
  const archivedKeywords: TrackedKeywordArchiveItem[] = [];

  const archiveManager = createArchiveStateManager(
    activeKeywords,
    (items) => (activeKeywords = items),
    archivedKeywords,
    (items) => (archivedKeywords = items)
  );

  return {
    activeKeywords,
    archivedKeywords,
    archiveManager,
  };
}

export function createKeywordTrackerStageCallback(
  archiveManager: ArchiveStateManager<TrackedKeywordArchiveItem>,
  workspaceId: string,
  locale: string,
  optimizerMutate?: (key: string | string[]) => Promise<any>
) {
  return async (params: OnStageSuccessParams) => {
    archiveManager.moveToArchive(params.payload.signalId, params.reason);

    console.info(
      "[KeywordTrackerModule] Keyword moved to archive:",
      params.payload.signalId
    );

    if (optimizerMutate) {
      try {
        await triggerOptimizerSync({
          workspaceId,
          mutate: optimizerMutate,
        });
      } catch (error) {
        console.warn("[KeywordTrackerModule] Optimizer sync failed:", error);
      }
    }
  };
}

/**
 * ALERTS MODULE IMPLEMENTATION
 *
 * Handles staging of alerts from alert cards
 */
export interface AlertArchiveItem {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: "critical" | "warning" | "info";
  createdAt: string;
  _archivedAt?: string;
  _archivedReason?: "staged" | "dismissed" | "archived";
}

export interface AlertsModuleState {
  activeAlerts: AlertArchiveItem[];
  archivedAlerts: AlertArchiveItem[];
  archiveManager: ArchiveStateManager<AlertArchiveItem>;
}

export function initializeAlertsModuleState(
  initialAlerts: AlertArchiveItem[]
): AlertsModuleState {
  const activeAlerts = initialAlerts;
  const archivedAlerts: AlertArchiveItem[] = [];

  const archiveManager = createArchiveStateManager(
    activeAlerts,
    (items) => (activeAlerts = items),
    archivedAlerts,
    (items) => (archivedAlerts = items)
  );

  return {
    activeAlerts,
    archivedAlerts,
    archiveManager,
  };
}

export function createAlertsStageCallback(
  archiveManager: ArchiveStateManager<AlertArchiveItem>,
  workspaceId: string,
  locale: string,
  optimizerMutate?: (key: string | string[]) => Promise<any>
) {
  return async (params: OnStageSuccessParams) => {
    archiveManager.moveToArchive(params.payload.signalId, params.reason);

    console.info(
      "[AlertsModule] Alert moved to archive:",
      params.payload.signalId
    );

    if (optimizerMutate) {
      try {
        await triggerOptimizerSync({
          workspaceId,
          mutate: optimizerMutate,
        });
      } catch (error) {
        console.warn("[AlertsModule] Optimizer sync failed:", error);
      }
    }
  };
}
