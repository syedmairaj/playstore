/**
 * Performance Attribution types.
 *
 * Links every ListingVersion to:
 *  (a) the GenerationSignalContext that drove its content  → VersionSignalSnapshot
 *  (b) daily Google Play Store funnel metrics             → PlayStoreDailyMetrics
 *
 * The Intelligence Layer combines both to produce a PerformanceAttributionRow
 * shown in the dashboard — including the Signal Efficacy Score.
 */

import type {
  BrandKitSignal,
  MarketIntelSignal,
  ReviewInsightsSignal,
  KeywordTrackerSignal,
  CompetitorSignal,
} from "@/lib/listing/generation-signal-context.types";
import type { ListingVersion } from "@/lib/listing/listing-version.types";

// ─────────────────────────────────────────────────────────────────────────────
// Signal snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Immutable snapshot of the GenerationSignalContext captured at the moment
 * runListingGenerationOrchestrator was invoked.
 *
 * Stored in `listing_version_signal_snapshots`.  The `jobId` is the
 * primary correlation key between generation and downstream metrics.
 */
export type VersionSignalSnapshot = {
  id: string;
  /** ListingVersion this snapshot belongs to (null for pre-versioning jobs). */
  versionId: string | null;
  /** The generation job that produced the listing content. */
  jobId: string;
  workspaceId: string;
  vaultLocale: "en" | "ar";

  // ── The five signal dimensions ──────────────────────────────
  brandKit: BrandKitSignal;
  marketIntel: MarketIntelSignal;
  reviews: ReviewInsightsSignal;
  keywordTracker: KeywordTrackerSignal;
  competitorSignals: CompetitorSignal;

  // ── Pre-computed counts (for fast Signal Efficacy queries) ──
  signalCount: number;
  keywordsCount: number;
  competitorsCount: number;
  reviewPainsCount: number;
  marketGapsCount: number;
  hasBrandKit: boolean;

  createdAt: string;
};

/** Minimal payload needed to persist a new signal snapshot. */
export type SaveSignalSnapshotParams = {
  jobId: string;
  versionId?: string | null;
  workspaceId: string;
  vaultLocale: "en" | "ar";
  brandKit: BrandKitSignal;
  marketIntel: MarketIntelSignal;
  reviews: ReviewInsightsSignal;
  keywordTracker: KeywordTrackerSignal;
  competitorSignals: CompetitorSignal;
};

// ─────────────────────────────────────────────────────────────────────────────
// Play Store metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One day of Google Play Store funnel metrics for a listing version.
 *
 * Source: Google Play Developer Reporting API or GCS acquisition CSV export.
 * Stored in `listing_version_metrics`.
 */
export type PlayStoreDailyMetrics = {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Unique users who viewed the store listing page. */
  storeVisits: number | null;
  /** Unique users who installed the app from the listing. */
  installers: number | null;
  /** Unique users who saw the app anywhere in Play Store (browse, search, etc.). */
  impressions: number | null;
  /** Conversion Rate = installers / storeVisits × 100 (%) */
  conversionRate: number | null;
  /** Store Listing CVR as reported by Google Play. */
  storeListingCvr: number | null;
  /** Click-Through Rate = storeVisits / impressions × 100 (%) */
  ctr: number | null;
  source: "play_store_api" | "gcs_export" | "manual";
};

/**
 * Aggregated performance data for one listing version
 * (computed from the daily metrics rows).
 */
export type VersionPerformanceSummary = {
  versionId: string;
  /** Daily metric rows, sorted ascending by date. */
  dailyMetrics: PlayStoreDailyMetrics[];
  /** Average CVR across all days with data. */
  avgConversionRate: number | null;
  /** Average CTR across all days with data. */
  avgCtr: number | null;
  /** Sum of impressions across all days. */
  totalImpressions: number | null;
  /** Sum of installers across all days. */
  totalInstallers: number | null;
  /** Number of days with data. */
  daysWithData: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Attribution row (one row in the dashboard table)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row in the Performance Attribution dashboard table.
 * Combines the ListingVersion, its SignalSnapshot, its PerformanceSummary,
 * and the computed Attribution metrics.
 */
export type PerformanceAttributionRow = {
  version: ListingVersion;
  /** Signal context captured at generation time. */
  signals: VersionSignalSnapshot | null;
  /** Aggregated Play Store performance for this version's deployment window. */
  performance: VersionPerformanceSummary | null;

  // ── Computed Attribution Metrics ──────────────────────────
  /**
   * CVR delta vs the immediately preceding deployed version.
   * Positive = improvement.  null for the first version or when
   * insufficient data exists.
   * Unit: percentage points (e.g. 0.5 = +0.5% CVR)
   */
  cvrDelta: number | null;
  /**
   * CTR delta vs the immediately preceding deployed version.
   * Unit: percentage points.
   */
  ctrDelta: number | null;
  /**
   * Signal Efficacy Score = cvrDelta / signalCount.
   *
   * Interpretation:
   *  > 0.1  → each signal contributed strongly to CVR improvement
   *  0–0.1  → moderate signal contribution
   *  < 0    → signals did not drive conversion improvement
   *  null   → insufficient data (no previous version or no metrics)
   */
  signalEfficacyScore: number | null;
  /**
   * Human-readable efficacy tier derived from signalEfficacyScore.
   */
  efficacyTier: "strong" | "moderate" | "weak" | "negative" | "insufficient";
};

// ─────────────────────────────────────────────────────────────────────────────
// API response
// ─────────────────────────────────────────────────────────────────────────────

export type PerformanceAttributionResponse = {
  ok: true;
  rows: PerformanceAttributionRow[];
  /** Total number of versions considered (including those without metrics). */
  totalVersions: number;
  /** Number of versions with at least one day of metric data. */
  versionsWithMetrics: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Metric upsert params
// ─────────────────────────────────────────────────────────────────────────────

export type UpsertVersionMetricsParams = {
  versionId: string;
  workspaceId: string;
  appId: string | null;
  packageName: string;
  vaultLocale: "en" | "ar";
  metrics: Omit<PlayStoreDailyMetrics, "source">[];
  source: PlayStoreDailyMetrics["source"];
};
