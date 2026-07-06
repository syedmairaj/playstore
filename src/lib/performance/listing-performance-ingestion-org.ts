/**
 * Listing Performance Ingestion Pipeline
 *
 * Orchestrates the full ETL cycle:
 *
 *   1. EXTRACT  — Download acquisition CSVs from GCS for each deployed app.
 *   2. TRANSFORM — Resolve which listing_version was live on each metric date;
 *                  attach the signal_context_snapshot from the snapshot table;
 *                  normalise CSV fields to listing_performance column types.
 *   3. LOAD     — Batch upsert into listing_performance using
 *                 ON CONFLICT (version_id, performance_date, vault_locale).
 *
 * ── Version resolution ───────────────────────────────────────────────────────
 *
 * A metric row for date D belongs to the listing_version that was DEPLOYED
 * most recently before or on D.  SQL:
 *
 *   SELECT id FROM listing_versions
 *   WHERE  workspace_id = $1 AND app_id = $2 AND vault_locale = $3
 *     AND  status = 'deployed' AND deployed_at::date <= D
 *   ORDER  BY deployed_at DESC LIMIT 1;
 *
 * This correctly handles "version 3 was deployed on June 10; a metric row
 * for June 8 belongs to version 2 (deployed May 5)".
 *
 * ── EN/AR locale handling ────────────────────────────────────────────────────
 *
 * GCS acquisition CSVs are per-package (not per-locale).  The same daily
 * visitor/installer count is attributed to both the EN and AR listing_versions
 * that were active on that day.  Each locale gets its own row in
 * listing_performance, linked to its respective listing_version.id.
 *
 * If only one locale has a deployed version on that date, only one row
 * is inserted; the other locale is silently skipped.
 */

#import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAcquisitionReport } from "@/lib/performance/play-store-acquisition-api";
import type { RawAcquisitionRow } from "@/lib/performance/play-store-acquisition-api";
import { isGooglePlayConfigured } from "@/lib/performance/google-play-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultLocale = "en" | "ar";

/** One row ready for insertion into listing_performance. */
type ListingPerformanceInsert = {
  version_id: string;
  workspace_id: string;
  vault_locale: VaultLocale;
  performance_date: string;            // YYYY-MM-DD
  store_visitors: string;              // bigint as string (Supabase JS driver)
  store_listing_page_views: null;      // not available from acquisition CSV
  installers: string;                  // bigint as string
  conversion_rate: number | null;
  impressions: null;                   // not available from acquisition CSV
  signal_context_snapshot: unknown;    // JSONB — null when no snapshot exists
  data_source: "gcs_export";
};

export type WorkspaceIngestionTarget = {
  workspaceId: string;
  appId: string;
  packageName: string;
};

export type IngestAppResult = {
  workspaceId: string;
  appId: string;
  packageName: string;
  locale: VaultLocale;
  rowsFetched: number;
  rowsUpserted: number;
  rowsSkipped: number;
  error?: string;
};

export type IngestAllResult = {
  ok: boolean;
  totalWorkspaces: number;
  totalApps: number;
  totalRowsUpserted: number;
  results: IngestAppResult[];
  errors: string[];
};

// ─── Version resolver ─────────────────────────────────────────────────────────

type ResolvedVersionRow = {
  id: string;
  workspace_id: string;
  vault_locale: string;
  source_job_id: string | null;
};

/**
 * Finds the listing_version that was active (deployed) on a given date
 * for one (workspaceId, appId, locale) combination.
 *
 * Returns null when no deployed version exists on or before that date.
 */
async function resolveActiveVersion(
  workspaceId: string,
  appId: string | null,
  locale: VaultLocale,
  date: string,
): Promise<ResolvedVersionRow | null> {
  const admin = getSupabaseAdmin();

  let query = admin
    .from("listing_versions")
    .select("id, workspace_id, vault_locale, source_job_id")
    .eq("workspace_id", workspaceId)
    .eq("vault_locale", locale)
    .eq("status", "deployed")
    .lte("deployed_at", `${date}T23:59:59Z`)
    .order("deployed_at", { ascending: false })
    .limit(1);

  if (appId) {
    query = query.eq("app_id", appId);
  } else {
    query = query.is("app_id", null);
  }

  const { data } = await query.maybeSingle();
  return (data as ResolvedVersionRow | null) ?? null;
}

// ─── Signal snapshot fetcher ──────────────────────────────────────────────────

/**
 * Returns the signal_context_snapshot JSONB for a version.
 * Looks up via source_job_id → listing_version_signal_snapshots.
 * Returns null when no snapshot exists (e.g. manual entries, pre-snapshot runs).
 */
async function fetchSignalSnapshot(
  sourceJobId: string | null,
): Promise<unknown> {
  if (!sourceJobId) return null;

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("listing_version_signal_snapshots")
    .select("brand_kit, market_intel, reviews, keyword_tracker, competitor_signals")
    .eq("job_id", sourceJobId)
    .maybeSingle();

  if (!data) return null;

  // Compose the full GenerationSignalContext shape inline.
  const row = data as {
    brand_kit: unknown;
    market_intel: unknown;
    reviews: unknown;
    keyword_tracker: unknown;
    competitor_signals: unknown;
  };

  return {
    brandKit: row.brand_kit,
    marketIntel: row.market_intel,
    reviews: row.reviews,
    keywordTracker: row.keyword_tracker,
    competitorSignals: row.competitor_signals,
  };
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Maps one RawAcquisitionRow + resolved version → ListingPerformanceInsert.
 */
function normalizeRow(
  raw: RawAcquisitionRow,
  version: ResolvedVersionRow,
  signalSnapshot: unknown,
  locale: VaultLocale,
): ListingPerformanceInsert {
  return {
    version_id: version.id,
    workspace_id: version.workspace_id,
    vault_locale: locale,
    performance_date: raw.date,
    // Supabase JS client accepts bigint as string.
    store_visitors: raw.storeVisitors.toString(),
    store_listing_page_views: null,
    installers: raw.installers.toString(),
    conversion_rate: raw.conversionRate,
    impressions: null,
    signal_context_snapshot: signalSnapshot,
    data_source: "gcs_export",
  };
}

// ─── Batch upsert ─────────────────────────────────────────────────────────────

const UPSERT_BATCH_SIZE = 100;

/**
 * Upserts listing_performance rows in batches of 100.
 * ON CONFLICT (version_id, performance_date, vault_locale) — updates all
 * mutable metric columns but preserves created_at.
 *
 * Returns the total number of rows upserted.
 */
async function batchUpsertListingPerformance(
  rows: ListingPerformanceInsert[],
): Promise<{ upserted: number; error?: string }> {
  if (rows.length === 0) return { upserted: 0 };

  const admin = getSupabaseAdmin();
  let upserted = 0;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);

    const { error, count } = await admin
      .from("listing_performance")
      .upsert(batch, {
        onConflict: "version_id,performance_date,vault_locale",
        ignoreDuplicates: false,   // DO UPDATE (not DO NOTHING)
      })
      .select("id", { count: "exact", head: true });

    if (error) {
      return {
        upserted,
        error: `Batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1} failed: ${error.message}`,
      };
    }

    upserted += count ?? batch.length;
  }

  return { upserted };
}

// ─── Per-app ingestion ────────────────────────────────────────────────────────

/**
 * Runs the full ETL for one (workspace, app, package) for the given date range
 * and locale.
 *
 * Called once per locale (en + ar) so each locale gets its own
 * listing_performance rows linked to the correct listing_version.
 */
export async function ingestAppLocale(
  target: WorkspaceIngestionTarget,
  locale: VaultLocale,
  fromDate: string,
  toDate: string,
): Promise<IngestAppResult> {
  const base: Omit<IngestAppResult, "rowsFetched" | "rowsUpserted" | "rowsSkipped" | "error"> = {
    workspaceId: target.workspaceId,
    appId: target.appId,
    packageName: target.packageName,
    locale,
  };

  // ── 1. Extract ────────────────────────────────────────────────────────────
  const fetchResult = await fetchAcquisitionReport({
    packageName: target.packageName,
    fromDate,
    toDate,
  });

  if (!fetchResult.ok) {
    return {
      ...base,
      rowsFetched: 0,
      rowsUpserted: 0,
      rowsSkipped: 0,
      error: `Fetch failed: ${fetchResult.reason}${fetchResult.detail ? ` (${fetchResult.detail})` : ""}`,
    };
  }

  const { rows: rawRows } = fetchResult;

  // ── 2. Transform ──────────────────────────────────────────────────────────
  const toInsert: ListingPerformanceInsert[] = [];
  let skipped = 0;

  // Cache signal snapshots per job_id to avoid redundant DB lookups.
  const snapshotCache = new Map<string, unknown>();

  for (const raw of rawRows) {
    const version = await resolveActiveVersion(
      target.workspaceId,
      target.appId,
      locale,
      raw.date,
    );

    if (!version) {
      skipped++;
      continue;
    }

    const cacheKey = version.source_job_id ?? `__no_job_${version.id}`;
    if (!snapshotCache.has(cacheKey)) {
      const snap = await fetchSignalSnapshot(version.source_job_id);
      snapshotCache.set(cacheKey, snap);
    }

    const signalSnapshot = snapshotCache.get(cacheKey) ?? null;
    toInsert.push(normalizeRow(raw, version, signalSnapshot, locale));
  }

  // ── 3. Load ───────────────────────────────────────────────────────────────
  const { upserted, error: upsertError } = await batchUpsertListingPerformance(toInsert);

  return {
    ...base,
    rowsFetched: rawRows.length,
    rowsUpserted: upserted,
    rowsSkipped: skipped,
    ...(upsertError ? { error: upsertError } : {}),
  };
}

// ─── Workspace discovery ──────────────────────────────────────────────────────

/**
 * Discovers all workspace+app combinations that have a configured
 * `canonical_package_id` (required for GCS lookup).
 */
export async function discoverIngestionTargets(): Promise<WorkspaceIngestionTarget[]> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("apps")
    .select("workspace_id, id, canonical_package_id")
    .not("canonical_package_id", "is", null)
    .neq("canonical_package_id", "");

  if (error || !data) return [];

  return (
    data as { workspace_id: string; id: string; canonical_package_id: string }[]
  ).map((row) => ({
    workspaceId: row.workspace_id,
    appId: row.id,
    packageName: row.canonical_package_id,
  }));
}

// ─── Main ingestion entry point ───────────────────────────────────────────────

/**
 * Runs the complete ingestion pipeline for all configured workspace apps.
 *
 * @param fromDate  ISO date — start of the fetch window (default: 2 days ago
 *                  to ensure yesterday's data is available; GCS reports lag ~1d)
 * @param toDate    ISO date — end of the fetch window (default: yesterday)
 * @param targets   Override the auto-discovered targets (for manual/test runs)
 */
export async function ingestAllWorkspaces(opts?: {
  fromDate?: string;
  toDate?: string;
  targets?: WorkspaceIngestionTarget[];
}): Promise<IngestAllResult> {
  if (!isGooglePlayConfigured()) {
    return {
      ok: false,
      totalWorkspaces: 0,
      totalApps: 0,
      totalRowsUpserted: 0,
      results: [],
      errors: ["Google Play not configured: set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID"],
    };
  }

  // Default: fetch yesterday (GCS reports typically have a 1-day lag).
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const ymd = yesterday.toISOString().slice(0, 10);

  const fromDate = opts?.fromDate ?? ymd;
  const toDate = opts?.toDate ?? ymd;

  const targets = opts?.targets ?? (await discoverIngestionTargets());

  if (targets.length === 0) {
    return {
      ok: true,
      totalWorkspaces: 0,
      totalApps: 0,
      totalRowsUpserted: 0,
      results: [],
      errors: [],
    };
  }

  const allResults: IngestAppResult[] = [];
  const errors: string[] = [];
  const locales: VaultLocale[] = ["en", "ar"];

  for (const target of targets) {
    for (const locale of locales) {
      try {
        const result = await ingestAppLocale(target, locale, fromDate, toDate);
        allResults.push(result);
        if (result.error) {
          errors.push(
            `${target.packageName}/${locale}: ${result.error}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${target.packageName}/${locale} threw: ${msg}`);
        allResults.push({
          workspaceId: target.workspaceId,
          appId: target.appId,
          packageName: target.packageName,
          locale,
          rowsFetched: 0,
          rowsUpserted: 0,
          rowsSkipped: 0,
          error: msg,
        });
      }
    }
  }

  const uniqueWorkspaces = new Set(targets.map((t) => t.workspaceId)).size;
  const totalRowsUpserted = allResults.reduce((s, r) => s + r.rowsUpserted, 0);

  return {
    ok: errors.length === 0,
    totalWorkspaces: uniqueWorkspaces,
    totalApps: targets.length,
    totalRowsUpserted,
    results: allResults,
    errors,
  };
}
