/**
 * Google Play Store Metrics Service
 *
 * Fetches daily funnel metrics (impressions, store visits, installers, CVR, CTR)
 * from the Google Play Developer ecosystem and caches them in `listing_version_metrics`.
 *
 * ── Data Sources (in priority order) ───────────────────────────────────────
 *
 * 1. Google Cloud Storage (GCS) acquisition CSV export  [PRIMARY]
 *    Google Play Console exports acquisition data as CSV files to:
 *    gs://pubsite_prod_rev_{developerAccountId}/stats/acquisitions/
 *    File pattern: acquisitions_overview_v2_YYYYMM_{packageName}.csv
 *    Auth: Service Account with "Storage Object Viewer" on the bucket.
 *    Env: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID
 *
 * 2. Google Play Developer Reporting API  [SECONDARY — for crash/rating signals]
 *    https://playdeveloperreporting.googleapis.com/v1beta1/
 *    Note: As of 2026, the Reporting API does NOT expose funnel metrics (CVR/CTR).
 *    This path is reserved for future expansion.
 *
 * 3. Manual input  [FALLBACK]
 *    Users enter metrics via PATCH /performance-attribution/:versionId/metrics.
 *
 * ── Authentication ──────────────────────────────────────────────────────────
 * Service Account JSON with scopes:
 *   - https://www.googleapis.com/auth/devstorage.read_only
 *   - https://www.googleapis.com/auth/androidpublisher (for future Reporting API use)
 */

import "server-only";
import type { PlayStoreDailyMetrics } from "@/lib/performance/performance-attribution.types";
import {
  isGooglePlayConfigured,
  getGooglePlayAccessToken,
  getDeveloperAccountId,
  PLAY_SCOPES,
} from "@/lib/performance/google-play-auth";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const GCS_ACQUISITION_BUCKET_PREFIX = "pubsite_prod_rev_";
const GCS_STORAGE_API = "https://storage.googleapis.com/storage/v1";
const GCS_DOWNLOAD_API = "https://storage.googleapis.com";
const PLAY_REPORTING_API = "https://playdeveloperreporting.googleapis.com/v1beta1";

/** @deprecated Use isGooglePlayConfigured() from google-play-auth instead. */
export function isPlayStoreApiConfigured(): boolean {
  return isGooglePlayConfigured();
}

async function getAccessToken(scopes: string[]): Promise<string | null> {
  const result = await getGooglePlayAccessToken(scopes);
  return result.ok ? result.token : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GCS CSV acquisition report parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses Google Play's `acquisitions_overview_v2_*.csv` file.
 *
 * Expected columns (v2 format):
 *   Date, Package Name, Country, Store Listing Visitors, Installers, Install CTR (%)
 *
 * We aggregate across all countries per day.
 */
function parseAcquisitionCsv(
  csv: string,
  packageName: string,
): PlayStoreDailyMetrics[] {
  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Find header row (skip BOM if present)
  const rawHeader = lines[0].replace(/^\uFEFF/, "");
  const headers = rawHeader.split(",").map((h) => h.trim().toLowerCase().replace(/["\s]/g, ""));

  const colIndex = (name: string) => headers.findIndex((h) => h.includes(name));

  const dateIdx = colIndex("date");
  const packageIdx = colIndex("package");
  const visitorsIdx = colIndex("visitor");
  const installersIdx = colIndex("installer");
  const ctrIdx = colIndex("ctr");

  if (dateIdx === -1 || installersIdx === -1) return [];

  // Aggregate by date across countries.
  const byDate = new Map<
    string,
    { storeVisits: number; installers: number; ctrSum: number; ctrCount: number }
  >();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
    if (packageIdx !== -1 && cols[packageIdx] !== packageName) continue;

    const rawDate = cols[dateIdx] ?? "";
    if (!rawDate) continue;

    // Normalize date to YYYY-MM-DD
    const date = rawDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");

    const storeVisits = parseInt(cols[visitorsIdx] ?? "0", 10) || 0;
    const installers = parseInt(cols[installersIdx] ?? "0", 10) || 0;
    const ctrRaw = parseFloat(cols[ctrIdx] ?? "0") || 0;

    const existing = byDate.get(date) ?? { storeVisits: 0, installers: 0, ctrSum: 0, ctrCount: 0 };
    byDate.set(date, {
      storeVisits: existing.storeVisits + storeVisits,
      installers: existing.installers + installers,
      ctrSum: existing.ctrSum + ctrRaw,
      ctrCount: existing.ctrCount + (ctrRaw > 0 ? 1 : 0),
    });
  }

  return Array.from(byDate.entries()).map(([date, agg]) => {
    const cvr =
      agg.storeVisits > 0
        ? Math.round((agg.installers / agg.storeVisits) * 10000) / 100
        : null;
    const ctr = agg.ctrCount > 0 ? Math.round((agg.ctrSum / agg.ctrCount) * 100) / 100 : null;
    return {
      date,
      storeVisits: agg.storeVisits,
      installers: agg.installers,
      impressions: null, // not in acquisition CSV
      conversionRate: cvr,
      storeListingCvr: cvr,
      ctr,
      source: "gcs_export" as const,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GCS fetch
// ─────────────────────────────────────────────────────────────────────────────

async function listGcsObjects(
  bucketName: string,
  prefix: string,
  accessToken: string,
): Promise<string[]> {
  const url = `${GCS_STORAGE_API}/b/${encodeURIComponent(bucketName)}/o?prefix=${encodeURIComponent(prefix)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: { name: string }[] };
  return (json.items ?? []).map((item) => item.name);
}

async function downloadGcsObject(
  bucketName: string,
  objectName: string,
  accessToken: string,
): Promise<string | null> {
  const url = `${GCS_DOWNLOAD_API}/${bucketName}/${encodeURIComponent(objectName)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.text();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main public API
// ─────────────────────────────────────────────────────────────────────────────

export type FetchPlayStoreMetricsOptions = {
  packageName: string;
  /** ISO date range to fetch. Defaults to last 30 days. */
  fromDate?: string;
  toDate?: string;
};

export type FetchPlayStoreMetricsResult =
  | { ok: true; metrics: PlayStoreDailyMetrics[]; source: "gcs_export" | "play_store_api" }
  | { ok: false; reason: "not_configured" | "auth_failed" | "fetch_failed" | "no_data" };

/**
 * Fetches daily Play Store funnel metrics for the given package.
 *
 * Tries GCS acquisition CSV export first (the canonical source for
 * store visit → install funnel data).  Returns `ok: false` with a
 * typed reason when the API is not configured or fails.
 *
 * The caller should always check `ok` before using `metrics`.
 */
export async function fetchPlayStoreMetrics(
  options: FetchPlayStoreMetricsOptions,
): Promise<FetchPlayStoreMetricsResult> {
  if (!isGooglePlayConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  const developerAccountId = getDeveloperAccountId()!;
  const bucketName = `${GCS_ACQUISITION_BUCKET_PREFIX}${developerAccountId}`;

  try {
    const accessToken = await getAccessToken([PLAY_SCOPES.GCS_READ]);
    if (!accessToken) return { ok: false, reason: "auth_failed" };

    // List CSV files matching the package + date range.
    const prefix = `stats/acquisitions/acquisitions_overview_v2_`;
    const objectNames = await listGcsObjects(bucketName, prefix, accessToken);

    // Filter to files that likely contain data in the requested date range.
    const fromYYYYMM = (options.fromDate ?? new Date().toISOString().slice(0, 7)).replace(/-/, "");
    const toYYYYMM = (options.toDate ?? new Date().toISOString().slice(0, 7)).replace(/-/, "");

    const relevant = objectNames.filter((name) => {
      const match = name.match(/(\d{6})_/);
      if (!match) return false;
      const fileMonth = match[1];
      return fileMonth >= fromYYYYMM && fileMonth <= toYYYYMM;
    });

    if (relevant.length === 0) return { ok: false, reason: "no_data" };

    const allMetrics: PlayStoreDailyMetrics[] = [];

    for (const objectName of relevant) {
      const csv = await downloadGcsObject(bucketName, objectName, accessToken);
      if (!csv) continue;
      const parsed = parseAcquisitionCsv(csv, options.packageName);
      allMetrics.push(...parsed);
    }

    // De-duplicate by date (take latest parse if files overlap).
    const dedupMap = new Map<string, PlayStoreDailyMetrics>();
    for (const m of allMetrics) dedupMap.set(m.date, m);

    // Apply date range filter.
    const filtered = Array.from(dedupMap.values()).filter(
      (m) =>
        (!options.fromDate || m.date >= options.fromDate) &&
        (!options.toDate || m.date <= options.toDate),
    );

    if (filtered.length === 0) return { ok: false, reason: "no_data" };

    return { ok: true, metrics: filtered, source: "gcs_export" };
  } catch (err) {
    console.error("[play-store-metrics-service] fetch failed", err);
    return { ok: false, reason: "fetch_failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync helper: fetch → upsert cache
// ─────────────────────────────────────────────────────────────────────────────

import {
  upsertVersionMetrics,
  areMetricsStale,
} from "@/lib/db/listing-version-metrics";
import type { ListingVersion } from "@/lib/listing/listing-version.types";

/**
 * Orchestrates the full sync for a listing version:
 *  1. Skip if cached metrics are fresh (< 24 h).
 *  2. Fetch from GCS / Play Store API.
 *  3. Upsert into `listing_version_metrics`.
 *
 * Designed to be called in the background — does not throw.
 */
export async function syncVersionMetrics(
  version: ListingVersion,
  packageName: string,
  opts?: { forceRefresh?: boolean; deployedWindowDays?: number },
): Promise<{ synced: boolean; metricsCount: number }> {
  const forceRefresh = opts?.forceRefresh ?? false;

  if (!forceRefresh && !(await areMetricsStale(version.id))) {
    return { synced: false, metricsCount: 0 };
  }

  // Only fetch metrics for the deployment window (from deployedAt to now).
  const fromDate = version.deployedAt
    ? version.deployedAt.slice(0, 10)
    : version.createdAt.slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);

  const result = await fetchPlayStoreMetrics({ packageName, fromDate, toDate });
  if (!result.ok) return { synced: false, metricsCount: 0 };

  const upsertResult = await upsertVersionMetrics({
    versionId: version.id,
    workspaceId: version.workspaceId,
    appId: version.appId,
    packageName,
    vaultLocale: version.vaultLocale,
    metrics: result.metrics,
    source: result.source,
  });

  return {
    synced: upsertResult.ok,
    metricsCount: upsertResult.upserted,
  };
}

// Re-export for convenience
export { PLAY_REPORTING_API };
