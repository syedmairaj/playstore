import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePositionsGained,
  rankAtOrBeforeDeployment,
} from "@/lib/market/rank-progress";
import {
  buildSparkline7d,
  latestSnapshotMeta,
  loadMarketRankBundle,
  rankNearTimestamp,
  type MarketRankBundle,
  type MarketRankKeywordRow,
} from "@/lib/market/rank-tracking-bundle";
import type {
  KeywordRankCorrelation,
  LiveRankTrackingResult,
  PerformanceAlert,
} from "@/lib/market/rank-tracking.types";

export const HIGH_VOLUME_SEARCH_THRESHOLD = 1000;
export const PERFORMANCE_ALERT_DROP_POSITIONS = 3;
export const PERFORMANCE_ALERT_WINDOW_MS = 48 * 60 * 60 * 1000;

function resolveKeyword(
  bundle: MarketRankBundle,
  keyword: string,
): MarketRankKeywordRow | null {
  const trimmed = keyword.trim();
  if (!trimmed) return null;
  const byId = bundle.keywords.find((k) => k.id === trimmed);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  return (
    bundle.keywords.find((k) => k.term.toLowerCase() === lower) ?? null
  );
}

export function buildKeywordRankCorrelation(
  bundle: MarketRankBundle,
  kw: MarketRankKeywordRow,
  nowMs: number = Date.now(),
): KeywordRankCorrelation {
  const rows = bundle.snapshotsByKeyword.get(kw.id) ?? [];
  const deploymentDate = bundle.deploymentDate;

  let preDeploymentRank: number | null = null;
  if (deploymentDate) {
    const baseline = rankAtOrBeforeDeployment(rows, kw.market, deploymentDate);
    preDeploymentRank = baseline.rank;
    if (preDeploymentRank == null) {
      const fallback = kw.rank_at_last_listing_optimization;
      if (typeof fallback === "number" && Number.isFinite(fallback)) {
        preDeploymentRank = fallback;
      }
    }
  }

  const current = latestSnapshotMeta(rows, kw.market);
  const rankChange =
    preDeploymentRank != null && current.rank != null
      ? computePositionsGained(preDeploymentRank, current.rank)
      : null;

  const searchVolume = current.searchVolume;
  const isHighVolume =
    typeof searchVolume === "number" &&
    searchVolume >= HIGH_VOLUME_SEARCH_THRESHOLD;

  const monitoringKey = `${kw.id}:${kw.market.toLowerCase()}`;
  const monitoringRaw = bundle.monitoringByKeywordMarket.get(monitoringKey);
  const monitoringStatus =
    monitoringRaw === "tracking_pending" ||
    monitoringRaw === "active" ||
    monitoringRaw === "paused"
      ? monitoringRaw
      : null;

  return {
    keywordId: kw.id,
    term: kw.term,
    market: kw.market,
    preDeploymentRank,
    currentRank: current.rank,
    rankChange,
    searchVolume,
    isHighVolume,
    sparkline7d: buildSparkline7d(rows, kw.market, nowMs),
    monitoringStatus,
  };
}

export function detectPerformanceAlerts(
  correlations: KeywordRankCorrelation[],
  bundle: MarketRankBundle,
  nowMs: number = Date.now(),
): PerformanceAlert[] {
  const targetMs = nowMs - PERFORMANCE_ALERT_WINDOW_MS;
  const alerts: PerformanceAlert[] = [];

  for (const row of correlations) {
    if (!row.isHighVolume || row.currentRank == null) continue;

    const snapshots = bundle.snapshotsByKeyword.get(row.keywordId) ?? [];
    const rank48h = rankNearTimestamp(snapshots, row.market, targetMs);
    if (rank48h == null) continue;

    const positionsDropped = row.currentRank - rank48h;
    if (positionsDropped < PERFORMANCE_ALERT_DROP_POSITIONS) continue;

    alerts.push({
      keywordId: row.keywordId,
      term: row.term,
      positionsDropped,
    });
  }

  alerts.sort((a, b) => b.positionsDropped - a.positionsDropped);
  return alerts;
}

export function buildLiveRankTrackingFromBundle(
  bundle: MarketRankBundle,
  nowMs: number = Date.now(),
): LiveRankTrackingResult {
  const correlations = bundle.keywords.map((kw) =>
    buildKeywordRankCorrelation(bundle, kw, nowMs),
  );

  correlations.sort((a, b) => {
    const changeA = a.rankChange ?? -Infinity;
    const changeB = b.rankChange ?? -Infinity;
    if (changeB !== changeA) return changeB - changeA;
    return a.term.localeCompare(b.term);
  });

  return {
    rows: correlations,
    alerts: detectPerformanceAlerts(correlations, bundle, nowMs),
    keywordCount: bundle.keywords.length,
    hasDeployment: bundle.deploymentDate != null,
    keywordScope: bundle.keywordScope,
  };
}

/**
 * Compares pre-deployment market rank (last Mark as Live) with the latest snapshot
 * for a single tracked keyword.
 */
export async function getRankCorrelation(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
  keyword: string;
}): Promise<KeywordRankCorrelation | null> {
  const bundle = await loadMarketRankBundle(params);
  const kw = resolveKeyword(bundle, params.keyword);
  if (!kw) return null;
  return buildKeywordRankCorrelation(bundle, kw);
}

export async function getLiveRankTracking(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
}): Promise<LiveRankTrackingResult> {
  const bundle = await loadMarketRankBundle(params);
  return buildLiveRankTrackingFromBundle(bundle);
}
