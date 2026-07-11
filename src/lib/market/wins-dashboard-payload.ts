import type { SupabaseClient } from "@supabase/supabase-js";
import { getGrowthForecast } from "@/lib/market/growth-forecast";
import { getRankProgress } from "@/lib/market/rank-progress";
import { buildLiveRankTrackingFromBundle } from "@/lib/market/rank-correlation";
import { loadMarketRankBundle } from "@/lib/market/rank-tracking-bundle";
import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";
import type { RankProgressResult } from "@/lib/market/rank-progress.types";
import type { LiveRankTrackingResult } from "@/lib/market/rank-tracking.types";

export type WinsDashboardPayload = {
  progress: RankProgressResult;
  forecast: GrowthForecastResult;
  tracking: LiveRankTrackingResult;
};

export const EMPTY_LIVE_RANK_TRACKING: LiveRankTrackingResult = {
  rows: [],
  alerts: [],
  keywordCount: 0,
  hasDeployment: false,
  keywordScope: "workspace",
};

/** Matches Market Intel top-charts cache TTL. */
export const RANK_WINS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function computeWinsDashboardPayload(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
}): Promise<WinsDashboardPayload> {
  const { supabase, workspaceId, appId } = params;
  const bundle = await loadMarketRankBundle({ supabase, workspaceId, appId });
  const [progress, forecast] = await Promise.all([
    getRankProgress({ supabase, workspaceId, appId }),
    getGrowthForecast({ supabase, workspaceId, appId }),
  ]);
  const tracking = buildLiveRankTrackingFromBundle(bundle);
  return { progress, forecast, tracking };
}
