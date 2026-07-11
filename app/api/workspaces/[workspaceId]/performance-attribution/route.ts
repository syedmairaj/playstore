/**
 * GET /api/workspaces/:workspaceId/performance-attribution
 *
 * Returns a PerformanceAttributionResponse for the workspace — all listing
 * versions enriched with signal snapshots, aggregated Play Store metrics,
 * CVR deltas, and Signal Efficacy Scores.
 *
 * Query params:
 *   appId      (optional) — filter to a specific app
 *   locale     (optional) — 'en' | 'ar'; default 'en'
 *   limit      (optional) — max versions to include; default 20
 *   syncMetrics (optional) — '1' to trigger a background GCS sync before
 *                            returning (may add ~1-2s latency)
 *
 * PATCH /api/workspaces/:workspaceId/performance-attribution
 *
 * Manually upserts daily metrics for a specific version (source = 'manual').
 * Body: { versionId, packageName, metrics: PlayStoreDailyMetrics[] }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSnapshotsByVersionIds } from "@/lib/db/listing-version-signal-snapshots";
import {
  getPerformanceSummariesForVersions,
  upsertVersionMetrics,
} from "@/lib/db/listing-version-metrics";
import { buildAttributionRows } from "@/lib/performance/signal-efficacy";
import { getPlayMetricsIngestReadiness } from "@/lib/performance/play-metrics-ingest-readiness";
import { syncVersionMetrics } from "@/lib/performance/play-store-metrics-service";
import type {
  PerformanceAttributionResponse,
  PlayStoreDailyMetrics,
} from "@/lib/performance/performance-attribution.types";
import { resolveToneAppliedForVersion } from "@/lib/listing/resolve-tone-applied";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ScreenshotCaption, LiveListingSnapshot } from "@/lib/listing/listing-version.types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ workspaceId: string }> };

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const appId = url.searchParams.get("appId") ?? null;
  const locale = (url.searchParams.get("locale") ?? "en") as "en" | "ar";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
  const syncMetrics = url.searchParams.get("syncMetrics") === "1";

  const admin = getSupabaseAdmin();

  // ── Fetch listing versions ──────────────────────────────────────────────
  let versionsQuery = admin
    .from("listing_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("vault_locale", locale)
    .order("version_number", { ascending: false })
    .limit(limit);

  if (appId) {
    versionsQuery = versionsQuery.eq("app_id", appId);
  }

  const { data: versionRows, error: versionsError } = await versionsQuery;

  if (versionsError) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: versionsError.message } },
      { status: 500 },
    );
  }

  if (!versionRows || versionRows.length === 0) {
    const response: PerformanceAttributionResponse = {
      ok: true,
      rows: [],
      totalVersions: 0,
      versionsWithMetrics: 0,
      ingestReadiness: getPlayMetricsIngestReadiness(),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, no-cache" },
    });
  }

  // ── Row → ListingVersion ────────────────────────────────────────────────
  type VersionRow = {
    id: string; workspace_id: string; app_id: string | null; vault_locale: string;
    version_number: number; status: string; title: string | null;
    short_description: string | null; long_description: string | null;
    keyword_suggestions: unknown; cta_suggestions: unknown;
    screenshot_captions: unknown; live_listing_snapshot: unknown;
    source_queue_hash: string | null; source_job_id: string | null;
    source_generation_id: string | null; published_at: string | null;
    deployed_at: string | null; notes: string | null;
    created_by: string; created_at: string; updated_at: string;
  };

  const versions: ListingVersion[] = (versionRows as VersionRow[]).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    appId: row.app_id,
    vaultLocale: row.vault_locale as "en" | "ar",
    versionNumber: row.version_number,
    status: row.status as ListingVersion["status"],
    title: row.title,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    keywordSuggestions: Array.isArray(row.keyword_suggestions) ? row.keyword_suggestions as string[] : [],
    ctaSuggestions: Array.isArray(row.cta_suggestions) ? row.cta_suggestions as string[] : [],
    screenshotCaptions: Array.isArray(row.screenshot_captions) ? row.screenshot_captions as ScreenshotCaption[] : [],
    liveListingSnapshot: row.live_listing_snapshot as LiveListingSnapshot | null,
    sourceQueueHash: row.source_queue_hash,
    sourceJobId: row.source_job_id,
    sourceGenerationId: row.source_generation_id,
    publishedAt: row.published_at,
    deployedAt: row.deployed_at,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const versionIds = versions.map((v) => v.id);

  // ── Optionally trigger background GCS sync ──────────────────────────────
  if (syncMetrics) {
    // Fetch the package_name from the apps table if we have an appId.
    if (appId) {
      const { data: appRow } = await admin
        .from("apps")
        .select("canonical_package_id, metadata")
        .eq("id", appId)
        .maybeSingle();

      const packageName =
        (appRow as { canonical_package_id?: string | null; metadata?: { package_name?: string } } | null)
          ?.canonical_package_id ??
        null;

      if (packageName) {
        // Sync only deployed versions (the ones with real traffic data).
        const deployedVersions = versions.filter((v) => v.status === "deployed");
        for (const v of deployedVersions) {
          // Fire-and-forget; errors are swallowed inside syncVersionMetrics.
          syncVersionMetrics(v, packageName).catch(() => {});
        }
      }
    }
  }

  // ── Parallel fetch: snapshots + performance ─────────────────────────────
  const [snapshotsMap, performanceMap] = await Promise.all([
    getSnapshotsByVersionIds(versionIds),
    getPerformanceSummariesForVersions(versionIds, locale),
  ]);

  // ── Build attribution rows (ascending order for delta computation) ───────
  const rows = buildAttributionRows(versions, snapshotsMap, performanceMap);

  const generationIds = versions
    .map((v) => v.sourceGenerationId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const toneByGenerationId = new Map<string, string>();
  const outputByGenerationId = new Map<string, ListingGenerationOutput>();
  if (generationIds.length > 0) {
    const { data: generationRows } = await admin
      .from("listing_generations")
      .select("id, tone_style, output_json")
      .in("id", generationIds);
    for (const row of generationRows ?? []) {
      const r = row as {
        id: string;
        tone_style: string | null;
        output_json: unknown;
      };
      if (r.tone_style) toneByGenerationId.set(r.id, r.tone_style);
      const parsed =
        r.output_json && typeof r.output_json === "object"
          ? (r.output_json as ListingGenerationOutput)
          : null;
      if (parsed) outputByGenerationId.set(r.id, parsed);
    }
  }

  for (const row of rows) {
    const genId = row.version.sourceGenerationId;
    const fallbackTone = genId ? toneByGenerationId.get(genId) ?? null : null;
    const output = genId ? outputByGenerationId.get(genId) : undefined;
    const toneApplied = resolveToneAppliedForVersion(row.version, output, fallbackTone);
    row.toneApplied = toneApplied;
    row.toneStyle = toneApplied;
    row.experimentId = output?.toneExperiment?.experimentId ?? null;
  }

  // Reverse back to newest-first for the API consumer.
  rows.reverse();

  const versionsWithMetrics = rows.filter((r) => r.performance !== null).length;

  const response: PerformanceAttributionResponse = {
    ok: true,
    rows,
    totalVersions: versions.length,
    versionsWithMetrics,
    ingestReadiness: getPlayMetricsIngestReadiness(),
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store, no-cache" },
  });
}

// ─── PATCH — manual metric upsert ────────────────────────────────────────────

type PatchBody = {
  versionId: string;
  packageName: string;
  metrics: PlayStoreDailyMetrics[];
};

export async function PATCH(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const { versionId, packageName, metrics } = body;
  if (!versionId || !packageName || !Array.isArray(metrics)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "bad_request",
          message: "versionId, packageName, and metrics[] are required",
        },
      },
      { status: 400 },
    );
  }

  // Verify version belongs to workspace.
  const admin = getSupabaseAdmin();
  const { data: versionRow } = await admin
    .from("listing_versions")
    .select("app_id, vault_locale")
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!versionRow) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Version not found" } },
      { status: 404 },
    );
  }

  const row = versionRow as { app_id: string | null; vault_locale: string };

  const result = await upsertVersionMetrics({
    versionId,
    workspaceId,
    appId: row.app_id,
    packageName,
    vaultLocale: row.vault_locale as "en" | "ar",
    metrics,
    source: "manual",
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: result.error } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, upserted: result.upserted });
}
