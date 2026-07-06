import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  PlayStoreDailyMetrics,
  VersionPerformanceSummary,
  UpsertVersionMetricsParams,
} from "@/lib/performance/performance-attribution.types";

// ─── Row shape ────────────────────────────────────────────────────────────────

type MetricsRow = {
  id: string;
  version_id: string;
  workspace_id: string;
  app_id: string | null;
  package_name: string;
  vault_locale: string;
  metric_date: string;
  store_visits: number | null;
  installers: number | null;
  impressions: number | null;
  conversion_rate: number | null;
  store_listing_cvr: number | null;
  ctr: number | null;
  source: string;
  fetched_at: string;
  created_at: string;
};

function rowToMetrics(row: MetricsRow): PlayStoreDailyMetrics {
  return {
    date: row.metric_date,
    storeVisits: row.store_visits,
    installers: row.installers,
    impressions: row.impressions,
    conversionRate: row.conversion_rate !== null ? Number(row.conversion_rate) : null,
    storeListingCvr: row.store_listing_cvr !== null ? Number(row.store_listing_cvr) : null,
    ctr: row.ctr !== null ? Number(row.ctr) : null,
    source: row.source as PlayStoreDailyMetrics["source"],
  };
}

// ─── Aggregation helpers ───────────────────────────────────────────────────────

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0);
}

export function aggregateToSummary(
  versionId: string,
  daily: PlayStoreDailyMetrics[],
): VersionPerformanceSummary {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  return {
    versionId,
    dailyMetrics: sorted,
    avgConversionRate: avg(sorted.map((d) => d.conversionRate)),
    avgCtr: avg(sorted.map((d) => d.ctr)),
    totalImpressions: sum(sorted.map((d) => d.impressions)),
    totalInstallers: sum(sorted.map((d) => d.installers)),
    daysWithData: sorted.filter(
      (d) => d.conversionRate !== null || d.impressions !== null,
    ).length,
  };
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upserts daily metrics for a listing version.
 * ON CONFLICT (version_id, metric_date, vault_locale) → UPDATE.
 */
export async function upsertVersionMetrics(
  params: UpsertVersionMetricsParams,
): Promise<{ ok: boolean; upserted: number; error?: string }> {
  const admin = getSupabaseAdmin();

  const rows = params.metrics.map((m) => ({
    version_id: params.versionId,
    workspace_id: params.workspaceId,
    app_id: params.appId,
    package_name: params.packageName,
    vault_locale: params.vaultLocale,
    metric_date: m.date,
    store_visits: m.storeVisits ?? null,
    installers: m.installers ?? null,
    impressions: m.impressions ?? null,
    conversion_rate: m.conversionRate ?? null,
    store_listing_cvr: m.storeListingCvr ?? null,
    ctr: m.ctr ?? null,
    source: params.source,
    fetched_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return { ok: true, upserted: 0 };

  const { error, count } = await admin
    .from("listing_version_metrics")
    .upsert(rows, { onConflict: "version_id,metric_date,vault_locale" })
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[listing-version-metrics] upsert failed", {
      versionId: params.versionId,
      error: error.message,
    });
    return { ok: false, upserted: 0, error: error.message };
  }

  return { ok: true, upserted: count ?? rows.length };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Reads all metric rows for a single version and returns an aggregated summary.
 */
export async function getVersionPerformanceSummary(
  versionId: string,
  vaultLocale: "en" | "ar" = "en",
): Promise<VersionPerformanceSummary | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("listing_version_metrics")
    .select("*")
    .eq("version_id", versionId)
    .eq("vault_locale", vaultLocale)
    .order("metric_date", { ascending: true });

  if (error || !data || data.length === 0) return null;
  const daily = (data as MetricsRow[]).map(rowToMetrics);
  return aggregateToSummary(versionId, daily);
}

/**
 * Bulk fetch: returns a Map<versionId, VersionPerformanceSummary>
 * for all requested version IDs in one query.
 */
export async function getPerformanceSummariesForVersions(
  versionIds: string[],
  vaultLocale: "en" | "ar" = "en",
): Promise<Map<string, VersionPerformanceSummary>> {
  if (versionIds.length === 0) return new Map();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("listing_version_metrics")
    .select("*")
    .in("version_id", versionIds)
    .eq("vault_locale", vaultLocale)
    .order("metric_date", { ascending: true });

  if (error || !data) return new Map();

  // Group by version_id.
  const grouped = new Map<string, MetricsRow[]>();
  for (const row of data as MetricsRow[]) {
    const existing = grouped.get(row.version_id) ?? [];
    existing.push(row);
    grouped.set(row.version_id, existing);
  }

  const result = new Map<string, VersionPerformanceSummary>();
  for (const [vId, rows] of grouped) {
    result.set(vId, aggregateToSummary(vId, rows.map(rowToMetrics)));
  }
  return result;
}

/**
 * Checks whether metrics were fetched within the last `maxAgeHours` hours.
 * Used to decide whether to re-fetch from the Play Store API.
 */
export async function areMetricsStale(
  versionId: string,
  maxAgeHours = 24,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("listing_version_metrics")
    .select("fetched_at")
    .eq("version_id", versionId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return true;
  const row = data as { fetched_at: string };
  const ageMs = Date.now() - new Date(row.fetched_at).getTime();
  return ageMs > maxAgeHours * 3_600_000;
}
