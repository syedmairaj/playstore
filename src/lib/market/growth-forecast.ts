import type { SupabaseClient } from "@supabase/supabase-js";
import { primaryPlayCountryForKeyword } from "@/lib/keywords/primary-market-latest-rank";
import type { RankSnapshotLite } from "@/lib/keywords/primary-market-latest-rank";
import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";

export const MOMENTUM_LOOKBACK_DAYS = 14;
export const MIN_POST_DEPLOY_RANK_DAYS = 5;
export const FORECAST_PROJECTION_DAYS = 7;
export const MONTH_LENGTH_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type SerperSnapshotRow = RankSnapshotLite & {
  keyword_id: string;
};

type KeywordRow = {
  id: string;
  market: string;
};

export type DailyAvgRankPoint = {
  date: string;
  avgRank: number;
};

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetweenUtc(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

function filterPrimaryMarketRows(
  rows: RankSnapshotLite[],
  keywordMarket: string,
): RankSnapshotLite[] {
  const mkt = primaryPlayCountryForKeyword(keywordMarket);
  return rows.filter((r) => {
    const ccRaw = r.country_code;
    const cc =
      ccRaw != null && String(ccRaw).trim() !== ""
        ? String(ccRaw).trim().toLowerCase()
        : "";
    return cc === "" || cc === mkt;
  });
}

/**
 * Builds one average-rank point per calendar day across all tracked keywords.
 */
export function buildDailyAverageRankSeries(params: {
  keywords: KeywordRow[];
  snapshotsByKeyword: Map<string, SerperSnapshotRow[]>;
  deploymentIso: string;
  lookbackDays?: number;
  nowMs?: number;
}): DailyAvgRankPoint[] {
  const {
    keywords,
    snapshotsByKeyword,
    deploymentIso,
    lookbackDays = MOMENTUM_LOOKBACK_DAYS,
    nowMs = Date.now(),
  } = params;

  const deployMs = new Date(deploymentIso).getTime();
  if (!Number.isFinite(deployMs)) return [];

  const windowStartMs = Math.max(deployMs, nowMs - lookbackDays * MS_PER_DAY);
  const ranksByDay = new Map<string, number[]>();

  for (const kw of keywords) {
    const primaryRows = filterPrimaryMarketRows(
      snapshotsByKeyword.get(kw.id) ?? [],
      kw.market,
    ).filter((r) => {
      const t = new Date(r.snapshot_at).getTime();
      return Number.isFinite(t) && t >= windowStartMs && t >= deployMs;
    });

    const latestPerDay = new Map<string, RankSnapshotLite>();
    for (const row of primaryRows) {
      const day = utcDateKey(row.snapshot_at);
      const existing = latestPerDay.get(day);
      if (
        !existing ||
        new Date(row.snapshot_at).getTime() >
          new Date(existing.snapshot_at).getTime()
      ) {
        latestPerDay.set(day, row);
      }
    }

    for (const snap of latestPerDay.values()) {
      if (snap.rank == null || !Number.isFinite(snap.rank)) continue;
      if (!ranksByDay.has(utcDateKey(snap.snapshot_at))) {
        ranksByDay.set(utcDateKey(snap.snapshot_at), []);
      }
      ranksByDay.get(utcDateKey(snap.snapshot_at))!.push(snap.rank);
    }
  }

  return [...ranksByDay.entries()]
    .map(([date, ranks]) => ({
      date,
      avgRank: ranks.reduce((sum, r) => sum + r, 0) / ranks.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Positive value means rank number is decreasing (improving). */
export function computeAvgDailyRankImprovement(
  series: DailyAvgRankPoint[],
): number {
  if (series.length < 2) return 0;
  const first = series[0];
  const last = series[series.length - 1];
  const elapsedDays = daysBetweenUtc(first.date, last.date);
  if (elapsedDays <= 0) return 0;
  return (first.avgRank - last.avgRank) / elapsedDays;
}

export function computeEstimatedInstallVelocity(
  avgDailyRankImprovement: number,
  conversionRatePercent: number,
): number {
  if (avgDailyRankImprovement <= 0 || conversionRatePercent <= 0) return 0;
  return avgDailyRankImprovement * conversionRatePercent;
}

export function buildProjectedTrendPoints(
  estimatedInstallVelocity: number,
  horizonDays: number = FORECAST_PROJECTION_DAYS,
): number[] {
  const velocity = Math.max(0, estimatedInstallVelocity);
  return Array.from({ length: horizonDays }, (_, i) =>
    Math.round(velocity * (i + 1) * 10) / 10,
  );
}

export function buildGrowthForecastPayload(params: {
  series: DailyAvgRankPoint[];
  conversionRatePercent: number | null;
}): GrowthForecastResult {
  const { series, conversionRatePercent } = params;
  const postDeploymentDataDays = series.length;

  const gathering =
    postDeploymentDataDays < MIN_POST_DEPLOY_RANK_DAYS ||
    conversionRatePercent == null ||
    conversionRatePercent <= 0;

  if (gathering) {
    return {
      status: "gathering",
      postDeploymentDataDays,
      avgDailyRankImprovement: null,
      conversionRatePercent,
      estimatedInstallVelocity: null,
      projectedMonthlyInstalls: null,
      trendPoints: [],
    };
  }

  const avgDailyRankImprovement = computeAvgDailyRankImprovement(series);
  const estimatedInstallVelocity = computeEstimatedInstallVelocity(
    avgDailyRankImprovement,
    conversionRatePercent,
  );
  const projectedMonthlyInstalls = Math.round(
    estimatedInstallVelocity * MONTH_LENGTH_DAYS,
  );

  return {
    status: estimatedInstallVelocity > 0 ? "ready" : "gathering",
    postDeploymentDataDays,
    avgDailyRankImprovement:
      Math.round(avgDailyRankImprovement * 100) / 100,
    conversionRatePercent,
    estimatedInstallVelocity:
      Math.round(estimatedInstallVelocity * 100) / 100,
    projectedMonthlyInstalls,
    trendPoints: buildProjectedTrendPoints(estimatedInstallVelocity),
  };
}

async function fetchLatestConversionRate(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("listing_metrics")
    .select("conversion_rate, metric_week")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .not("conversion_rate", "is", null)
    .order("metric_week", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const rate = data.conversion_rate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : null;
}

/**
 * Projects install momentum from post-deployment rank trends × current CVR.
 */
export async function getGrowthForecast(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
}): Promise<GrowthForecastResult> {
  const { supabase, workspaceId, appId } = params;

  const emptyGathering: GrowthForecastResult = {
    status: "gathering",
    postDeploymentDataDays: 0,
    avgDailyRankImprovement: null,
    conversionRatePercent: null,
    estimatedInstallVelocity: null,
    projectedMonthlyInstalls: null,
    trendPoints: [],
  };

  const { data: deployedVersion, error: versionErr } = await supabase
    .from("listing_versions")
    .select("deployed_at")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .eq("status", "deployed")
    .not("deployed_at", "is", null)
    .order("deployed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionErr) throw new Error(versionErr.message);
  if (!deployedVersion?.deployed_at) return emptyGathering;

  const { data: keywords, error: kwErr } = await supabase
    .from("keywords")
    .select("id, market")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId);

  if (kwErr) throw new Error(kwErr.message);
  const keywordRows = (keywords ?? []) as KeywordRow[];
  if (keywordRows.length === 0) return emptyGathering;

  const keywordIds = keywordRows.map((k) => k.id);
  const { data: snapshots, error: snapErr } = await supabase
    .from("keyword_rank_snapshots")
    .select("keyword_id, rank, snapshot_at, country_code, source")
    .in("keyword_id", keywordIds)
    .eq("source", "serper");

  if (snapErr) throw new Error(snapErr.message);

  const byKeyword = new Map<string, SerperSnapshotRow[]>();
  for (const row of snapshots ?? []) {
    const kid = row.keyword_id as string;
    if (!byKeyword.has(kid)) byKeyword.set(kid, []);
    byKeyword.get(kid)!.push({
      keyword_id: kid,
      rank: row.rank as number | null,
      snapshot_at: String(row.snapshot_at ?? ""),
      country_code: row.country_code as string | null | undefined,
    });
  }

  const series = buildDailyAverageRankSeries({
    keywords: keywordRows,
    snapshotsByKeyword: byKeyword,
    deploymentIso: String(deployedVersion.deployed_at),
  });

  const conversionRatePercent = await fetchLatestConversionRate(
    supabase,
    workspaceId,
    appId,
  );

  return buildGrowthForecastPayload({ series, conversionRatePercent });
}
