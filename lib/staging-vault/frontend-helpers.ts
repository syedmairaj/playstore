/**
 * Frontend Signal Mapping Helpers
 *
 * Utilities for mapping UI signals across all modules to the standardized stageSignal format.
 * Ensures consistent context binding before sending to the backend.
 *
 * Used by:
 * - Common Issues Module (review analysis cards)
 * - Competitor Spy Module (competitor weakness cards)
 * - Keyword Tracker Module (alert cards)
 * - Market Intel Module (opportunity cards)
 */

import type {
  StageSignalRequest,
  SourceContext,
  SignalType,
  SignalSource,
  ReviewMetadata,
  CompetitorMetadata,
  KeywordMetadata,
} from "./stageSignal";

// ── Common Issues Mapper ──────────────────────────────────────────────
/**
 * Map a review issue from Common Issues module to StageSignal format
 *
 * @param params - Issue data from CommonIssuesPanel or IssueCard
 * @returns Properly formatted StageSignalRequest ready for stageSignal()
 *
 * @example
 * const issueCard = {
 *   title: "App Crashes on Startup",
 *   description: "Users report app crashing when launching",
 *   severity: "critical",
 *   impactPercent: 45,
 *   topQuote: "The app won't open at all",
 *   language: "en"
 * };
 *
 * const signalRequest = mapReviewIssueToSignal({
 *   issueId: "issue-123",
 *   issue: issueCard,
 *   workspaceId: "ws-456",
 *   appId: "app-789"
 * });
 *
 * await stageSignal(supabase, signalRequest);
 */
export function mapReviewIssueToSignal(params: {
  issueId: string; // Unique identifier for this issue
  issue: {
    title: string;
    description?: string;
    severity?: "critical" | "high" | "medium" | "low";
    impactPercent?: number;
    topQuote?: string;
    quoteCount?: number;
    language?: string;
  };
  workspaceId: string;
  appId?: string;
}): StageSignalRequest {
  const { issueId, issue, workspaceId, appId } = params;

  return {
    workspace_id: workspaceId,
    signal_type: "review_issue" as SignalType,
    source: "review_analysis" as SignalSource,
    source_context: "common_issues_theme" as SourceContext,
    source_context_id: issueId, // ← Critical: links back to source
    content: issue.title,
    language: (issue.language || "en") as "en" | "ar",
    source_app_id: appId,
    metadata: {
      description: issue.description,
      severity: issue.severity || "medium",
      impactPercent: issue.impactPercent || 0,
      topQuote: issue.topQuote,
      quoteCount: issue.quoteCount,
    } as ReviewMetadata,
  };
}

// ── Competitor Weakness Mapper ────────────────────────────────────────
/**
 * Map a competitor weakness to StageSignal format
 *
 * @param params - Weakness data from Competitor Spy module
 * @returns Properly formatted StageSignalRequest
 *
 * @example
 * const weakness = {
 *   title: "Missing Dark Mode",
 *   description: "Competitor app lacks dark mode support",
 *   competitorName: "CompetitorApp Pro",
 *   competitorPackage: "com.competitor.app",
 *   severity: "high",
 *   language: "en"
 * };
 *
 * const signalRequest = mapCompetitorWeaknessToSignal({
 *   weaknessId: "weakness-456",
 *   weakness,
 *   workspaceId: "ws-789"
 * });
 *
 * await stageSignal(supabase, signalRequest);
 */
export function mapCompetitorWeaknessToSignal(params: {
  weaknessId: string; // Unique identifier for this weakness
  weakness: {
    title: string;
    description?: string;
    competitorName?: string;
    competitorPackage?: string;
    severity?: "critical" | "high" | "medium" | "low";
    rating?: number;
    marketShare?: number;
    language?: string;
  };
  workspaceId: string;
}): StageSignalRequest {
  const { weaknessId, weakness, workspaceId } = params;

  return {
    workspace_id: workspaceId,
    signal_type: "competitor_weakness" as SignalType,
    source: "competitor_spy" as SignalSource,
    source_context: "competitor_weakness" as SourceContext,
    source_context_id: weakness.competitorPackage || weaknessId, // ← Package name for tracking
    content: weakness.title,
    language: (weakness.language || "en") as "en" | "ar",
    metadata: {
      description: weakness.description,
      competitorName: weakness.competitorName,
      severity: weakness.severity || "medium",
      rating: weakness.rating,
      marketShare: weakness.marketShare,
    } as CompetitorMetadata,
  };
}

// ── Competitor Sentiment Mapper ───────────────────────────────────────
/**
 * Map competitor sentiment analysis to StageSignal format
 *
 * @param params - Sentiment analysis from Competitor Spy sentiment endpoint
 * @returns Properly formatted StageSignalRequest
 */
export function mapCompetitorSentimentToSignal(params: {
  sentimentId: string;
  sentiment: {
    title: string;
    topicArea: "praise" | "bugs" | "features";
    competitorPackage: string;
    keywords: string[];
    language?: string;
  };
  workspaceId: string;
}): StageSignalRequest {
  const { sentimentId, sentiment, workspaceId } = params;

  return {
    workspace_id: workspaceId,
    signal_type: "competitor_weakness" as SignalType,
    source: "competitor_spy" as SignalSource,
    source_context: "competitor_sentiment" as SourceContext,
    source_context_id: sentiment.competitorPackage,
    content: sentiment.title,
    language: (sentiment.language || "en") as "en" | "ar",
    metadata: {
      topicArea: sentiment.topicArea,
      keywords: sentiment.keywords,
    },
  };
}

// ── Keyword Spotlight Mapper ──────────────────────────────────────────
/**
 * Map a keyword spotlight finding to StageSignal format
 *
 * @param params - Keyword data from Market > Keyword Spotlight
 * @returns Properly formatted StageSignalRequest
 *
 * @example
 * const keyword = {
 *   keyword: "password manager",
 *   searchVolume: 125000,
 *   difficulty: 65,
 *   category: "Finance",
 *   language: "en"
 * };
 *
 * const signalRequest = mapKeywordSpotlightToSignal({
 *   keywordId: "kw-789",
 *   keyword,
 *   workspaceId: "ws-123",
 *   category: "Finance"
 * });
 */
export function mapKeywordSpotlightToSignal(params: {
  keywordId: string;
  keyword: {
    keyword: string;
    searchVolume?: number;
    difficulty?: number;
    category?: string;
    language?: string;
  };
  workspaceId: string;
  category?: string;
}): StageSignalRequest {
  const { keywordId, keyword, workspaceId, category } = params;

  return {
    workspace_id: workspaceId,
    signal_type: "keyword" as SignalType,
    source: "keyword_spotlight" as SignalSource,
    source_context: "keyword_spotlight" as SourceContext,
    source_context_id: keywordId,
    content: keyword.keyword,
    language: (keyword.language || "en") as "en" | "ar",
    metadata: {
      searchVolume: keyword.searchVolume,
      difficulty: keyword.difficulty,
      category: category || keyword.category,
    } as KeywordMetadata,
  };
}

// ── Keyword Tracker Alert Mapper ──────────────────────────────────────
/**
 * Map a keyword tracker alert to StageSignal format
 *
 * @param params - Alert data from Keyword Tracker
 * @returns Properly formatted StageSignalRequest
 */
export function mapKeywordTrackerAlertToSignal(params: {
  alertId: string;
  alert: {
    keyword: string;
    currentRank?: number;
    previousRank?: number;
    change?: number;
    country?: string;
    language?: string;
  };
  workspaceId: string;
  appId?: string;
}): StageSignalRequest {
  const { alertId, alert, workspaceId, appId } = params;

  return {
    workspace_id: workspaceId,
    signal_type: "keyword" as SignalType,
    source: "keyword_tracker" as SignalSource,
    source_context: "keyword_tracker_alert" as SourceContext,
    source_context_id: alertId,
    content: alert.keyword,
    language: (alert.language || "en") as "en" | "ar",
    source_app_id: appId,
    metadata: {
      currentRank: alert.currentRank,
      previousRank: alert.previousRank,
      change: alert.change,
      country: alert.country,
    } as KeywordMetadata,
  };
}

// ── Market Opportunity Mapper ─────────────────────────────────────────
/**
 * Map a market intelligence finding to StageSignal format
 *
 * @param params - Opportunity data from Market Intelligence
 * @returns Properly formatted StageSignalRequest
 */
export function mapMarketOpportunityToSignal(params: {
  opportunityId: string;
  opportunity: {
    title: string;
    description?: string;
    market?: string;
    difficulty?: number;
    potential?: number;
    language?: string;
  };
  workspaceId: string;
}): StageSignalRequest {
  const { opportunityId, opportunity, workspaceId } = params;

  return {
    workspace_id: workspaceId,
    signal_type: "optimization_insight" as SignalType,
    source: "market_intelligence" as SignalSource,
    source_context: "market_opportunity" as SourceContext,
    source_context_id: opportunityId,
    content: opportunity.title,
    language: (opportunity.language || "en") as "en" | "ar",
    metadata: {
      description: opportunity.description,
      market: opportunity.market,
      difficulty: opportunity.difficulty,
      potential: opportunity.potential,
    },
  };
}

// ── Batch Mapper Utility ──────────────────────────────────────────────
/**
 * Map multiple signals at once
 * Useful for staging all issues from a category together
 *
 * @param signals - Array of signals in any format
 * @param mapperFunction - Function to map each signal
 * @returns Array of StageSignalRequest objects
 *
 * @example
 * const issues = [...];
 * const requests = batchMapSignals(
 *   issues,
 *   (issue, idx) => mapReviewIssueToSignal({
 *     issueId: `issue-${idx}`,
 *     issue,
 *     workspaceId: "ws-123"
 *   })
 * );
 *
 * // Stage all
 * for (const req of requests) {
 *   await stageSignal(supabase, req);
 * }
 */
export function batchMapSignals<T>(
  signals: T[],
  mapperFunction: (signal: T, index: number) => StageSignalRequest
): StageSignalRequest[] {
  return signals.map((signal, index) => mapperFunction(signal, index));
}

// ── Validation Helper ─────────────────────────────────────────────────
/**
 * Validate that a StageSignalRequest is properly formed before sending
 *
 * @param request - Request to validate
 * @returns { valid: boolean, errors: string[] }
 */
export function validateSignalRequest(request: StageSignalRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.workspace_id) errors.push("workspace_id is required");
  if (!request.signal_type) errors.push("signal_type is required");
  if (!request.source) errors.push("source is required");
  if (!request.source_context) errors.push("source_context is required");
  if (!request.source_context_id)
    errors.push("source_context_id is required (critical for AI Optimizer)");
  if (!request.content) errors.push("content is required");
  if (!request.language) errors.push("language is required (en or ar)");
  if (!["en", "ar"].includes(request.language)) {
    errors.push(`language must be 'en' or 'ar', got '${request.language}'`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export types for use in component files
 */
export type { StageSignalRequest };
