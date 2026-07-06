/**
 * Signal Efficacy Model
 *
 * Combines listing version metadata, signal snapshots, and Play Store metrics
 * into the PerformanceAttributionRow[] consumed by the dashboard.
 *
 * ── Signal Efficacy Score ────────────────────────────────────────────────────
 *
 *   scoreRaw = ΔCVRppt / signalCount
 *
 * Where:
 *   ΔCVRppt  = avgCVR(current) − avgCVR(previous deployed version)
 *              expressed in percentage points
 *   signalCount = total unique signals injected at generation time
 *                 (keywords + competitors + review pain points +
 *                  market gaps + brand kit presence)
 *
 * Interpretation:
 *   > 0.10   strong  — each signal drove meaningful conversion improvement
 *   0–0.10   moderate — signals contributed, but with diminishing returns
 *   exactly 0 weak   — signals present but no measurable CVR change
 *   < 0      negative — CVR declined despite signals (or despite them)
 *   null     insufficient — no previous version or missing metrics
 */

import type {
  PerformanceAttributionRow,
  VersionSignalSnapshot,
  VersionPerformanceSummary,
} from "@/lib/performance/performance-attribution.types";
import type { ListingVersion } from "@/lib/listing/listing-version.types";

// ─── Score thresholds ─────────────────────────────────────────────────────────

const STRONG_THRESHOLD = 0.10;
const MODERATE_THRESHOLD = 0.0;

// ─── Core scoring function ────────────────────────────────────────────────────

/**
 * Computes the Signal Efficacy Score.
 *
 * @param cvrDelta  CVR change in percentage points vs previous version.
 * @param signalCount  Total signals used (from VersionSignalSnapshot.signalCount).
 * @returns  Score rounded to 4 decimal places, or null when inputs are insufficient.
 */
export function calculateSignalEfficacyScore(
  cvrDelta: number | null,
  signalCount: number | null,
): number | null {
  if (cvrDelta === null || !signalCount || signalCount === 0) return null;
  return Math.round((cvrDelta / signalCount) * 10000) / 10000;
}

/**
 * Classifies the efficacy score into a human-readable tier.
 */
export function getEfficacyTier(
  score: number | null,
): PerformanceAttributionRow["efficacyTier"] {
  if (score === null) return "insufficient";
  if (score > STRONG_THRESHOLD) return "strong";
  if (score >= MODERATE_THRESHOLD) return "moderate";
  if (score === 0) return "weak";
  return "negative";
}

// ─── CVR delta computation ────────────────────────────────────────────────────

/**
 * Computes the CVR delta between two version performance summaries.
 * Returns null when either has no CVR data.
 */
export function computeCvrDelta(
  current: VersionPerformanceSummary | null,
  previous: VersionPerformanceSummary | null,
): number | null {
  if (!current?.avgConversionRate || !previous?.avgConversionRate) return null;
  return Math.round((current.avgConversionRate - previous.avgConversionRate) * 10000) / 10000;
}

/**
 * Computes the CTR delta between two version performance summaries.
 */
export function computeCtrDelta(
  current: VersionPerformanceSummary | null,
  previous: VersionPerformanceSummary | null,
): number | null {
  if (!current?.avgCtr || !previous?.avgCtr) return null;
  return Math.round((current.avgCtr - previous.avgCtr) * 10000) / 10000;
}

// ─── Attribution model ────────────────────────────────────────────────────────

/**
 * Builds the full PerformanceAttributionRow[] from raw inputs.
 *
 * Versions are processed in ascending chronological order so that
 * each version is compared to the immediately preceding DEPLOYED version.
 *
 * @param versions  All listing versions for the workspace/app, sorted by
 *                  version_number ASC (or created_at ASC).
 * @param snapshots  Map<versionId, VersionSignalSnapshot>
 * @param performance  Map<versionId, VersionPerformanceSummary>
 */
export function buildAttributionRows(
  versions: ListingVersion[],
  snapshots: Map<string, VersionSignalSnapshot>,
  performance: Map<string, VersionPerformanceSummary>,
): PerformanceAttributionRow[] {
  // Sort ascending by version_number for delta computation.
  const sorted = [...versions].sort(
    (a, b) => (a.versionNumber ?? 0) - (b.versionNumber ?? 0),
  );

  // Track the last deployed version that had CVR data.
  let prevDeployedSummary: VersionPerformanceSummary | null = null;

  return sorted.map((version) => {
    const signals = snapshots.get(version.id) ?? null;
    const perfSummary = performance.get(version.id) ?? null;

    const cvrDelta = computeCvrDelta(perfSummary, prevDeployedSummary);
    const ctrDelta = computeCtrDelta(perfSummary, prevDeployedSummary);
    const score = calculateSignalEfficacyScore(cvrDelta, signals?.signalCount ?? null);
    const tier = getEfficacyTier(score);

    const row: PerformanceAttributionRow = {
      version,
      signals,
      performance: perfSummary,
      cvrDelta,
      ctrDelta,
      signalEfficacyScore: score,
      efficacyTier: tier,
    };

    // Advance the "previous deployed" pointer only for versions that were
    // actually deployed (so draft/published versions don't pollute the baseline).
    if (version.status === "deployed" && perfSummary?.avgConversionRate !== null) {
      prevDeployedSummary = perfSummary;
    }

    return row;
  });
}

// ─── Signal summary helper (for dashboard display) ────────────────────────────

export type SignalSummary = {
  keywordCount: number;
  /** Top 3 high-confidence keywords. */
  topKeywords: string[];
  competitorCount: number;
  reviewPainCount: number;
  marketGapCount: number;
  hasBrandKit: boolean;
};

/**
 * Returns a compact signal summary for a snapshot, suitable for
 * the "Used Signals" column in the attribution table.
 */
export function summarizeSignals(
  snapshot: VersionSignalSnapshot | null,
): SignalSummary {
  if (!snapshot) {
    return {
      keywordCount: 0,
      topKeywords: [],
      competitorCount: 0,
      reviewPainCount: 0,
      marketGapCount: 0,
      hasBrandKit: false,
    };
  }

  const topKeywords = [
    ...snapshot.keywordTracker.highConfidenceKeywords,
    ...snapshot.keywordTracker.opportunityKeywords,
  ].slice(0, 3);

  return {
    keywordCount: snapshot.keywordsCount,
    topKeywords,
    competitorCount: snapshot.competitorsCount,
    reviewPainCount: snapshot.reviewPainsCount,
    marketGapCount: snapshot.marketGapsCount,
    hasBrandKit: snapshot.hasBrandKit,
  };
}
