import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeWinsDashboardPayload,
  EMPTY_LIVE_RANK_TRACKING,
  RANK_WINS_CACHE_TTL_MS,
  type WinsDashboardPayload,
} from "@/lib/market/wins-dashboard-payload";
import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";
import type { RankProgressResult } from "@/lib/market/rank-progress.types";
import type { LiveRankTrackingResult } from "@/lib/market/rank-tracking.types";

const CACHE_TABLE = "market_rank_wins_cache";

export type RankWinsCacheMeta = {
  fetchedAt: string;
  expiresAt: string;
  fromCache: boolean;
};

export type RankWinsCacheResult = WinsDashboardPayload & {
  meta: RankWinsCacheMeta;
};

function isRankProgressResult(value: unknown): value is RankProgressResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "wins" in value &&
    Array.isArray((value as RankProgressResult).wins)
  );
}

function isGrowthForecastResult(value: unknown): value is GrowthForecastResult {
  if (typeof value !== "object" || value === null) return false;
  const status = (value as GrowthForecastResult).status;
  return status === "ready" || status === "gathering";
}

function isLiveRankTrackingResult(value: unknown): value is LiveRankTrackingResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("rows" in value) ||
    !Array.isArray((value as LiveRankTrackingResult).rows) ||
    !("alerts" in value) ||
    !Array.isArray((value as LiveRankTrackingResult).alerts)
  ) {
    return false;
  }
  const tracking = value as LiveRankTrackingResult;
  return (
    typeof tracking.keywordCount === "number" &&
    typeof tracking.hasDeployment === "boolean"
  );
}

function normalizeTrackingJson(value: unknown): LiveRankTrackingResult {
  if (!isLiveRankTrackingResult(value)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "rows" in value &&
      Array.isArray((value as LiveRankTrackingResult).rows)
    ) {
      const legacy = value as LiveRankTrackingResult;
      return {
        rows: legacy.rows,
        alerts: legacy.alerts ?? [],
        keywordCount: legacy.rows.length,
        hasDeployment: false,
        keywordScope: "workspace",
      };
    }
    return EMPTY_LIVE_RANK_TRACKING;
  }
  return value;
}

export async function readRankWinsCache(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  options?: { allowStale?: boolean },
): Promise<RankWinsCacheResult | null> {
  const { data, error } = await supabase
    .from(CACHE_TABLE)
    .select("progress_json, forecast_json, tracking_json, fetched_at, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .maybeSingle();

  if (error || !data) return null;
  const expired = new Date(String(data.expires_at)) <= new Date();
  if (expired && !options?.allowStale) return null;
  if (
    !isRankProgressResult(data.progress_json) ||
    !isGrowthForecastResult(data.forecast_json)
  ) {
    return null;
  }

  return {
    progress: data.progress_json,
    forecast: data.forecast_json,
    tracking: normalizeTrackingJson(data.tracking_json),
    meta: {
      fetchedAt: String(data.fetched_at),
      expiresAt: String(data.expires_at),
      fromCache: true,
    },
  };
}

export async function writeRankWinsCache(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  payload: WinsDashboardPayload,
): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RANK_WINS_CACHE_TTL_MS).toISOString();

  const { error } = await supabase.from(CACHE_TABLE).upsert(
    {
      workspace_id: workspaceId,
      app_id: appId,
      progress_json: payload.progress,
      forecast_json: payload.forecast,
      tracking_json: payload.tracking,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    },
    { onConflict: "workspace_id,app_id" },
  );

  if (error) throw new Error(error.message);
}

/**
 * Cache-first read with optional force refresh. Computes and persists on miss.
 */
export async function getRankWinsCached(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
  forceRefresh?: boolean;
}): Promise<RankWinsCacheResult> {
  const { supabase, workspaceId, appId, forceRefresh = false } = params;

  if (!forceRefresh) {
    const cached = await readRankWinsCache(supabase, workspaceId, appId);
    if (cached) return cached;

    const stale = await readRankWinsCache(supabase, workspaceId, appId, {
      allowStale: true,
    });
    if (stale) {
      void computeWinsDashboardPayload({ supabase, workspaceId, appId })
        .then((payload) => writeRankWinsCache(supabase, workspaceId, appId, payload))
        .catch((err) => {
          console.warn("[rank-wins-cache] background refresh failed:", err);
        });
      return stale;
    }
  }

  const payload = await computeWinsDashboardPayload({
    supabase,
    workspaceId,
    appId,
  });

  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RANK_WINS_CACHE_TTL_MS).toISOString();

  try {
    await writeRankWinsCache(supabase, workspaceId, appId, payload);
  } catch (err) {
    console.warn("[rank-wins-cache] write failed (non-fatal):", err);
  }

  return {
    ...payload,
    meta: { fetchedAt, expiresAt, fromCache: false },
  };
}

/** Distinct workspace/app pairs with tracked keywords (cron pre-warm targets). */
export async function listRankWinsCacheTargets(
  supabase: SupabaseClient,
): Promise<{ workspaceId: string; appId: string }[]> {
  const { data, error } = await supabase
    .from("keywords")
    .select("workspace_id, app_id")
    .not("app_id", "is", null);

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const out: { workspaceId: string; appId: string }[] = [];

  for (const row of data ?? []) {
    const workspaceId = row.workspace_id as string;
    const appId = row.app_id as string;
    if (!workspaceId || !appId) continue;
    const key = `${workspaceId}:${appId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ workspaceId, appId });
  }

  return out;
}
