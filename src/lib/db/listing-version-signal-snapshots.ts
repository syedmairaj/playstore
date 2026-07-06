import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  VersionSignalSnapshot,
  SaveSignalSnapshotParams,
} from "@/lib/performance/performance-attribution.types";
import type { GenerationSignalContext } from "@/lib/listing/generation-signal-context.types";

// ─── Row shape ────────────────────────────────────────────────────────────────

type SnapshotRow = {
  id: string;
  version_id: string | null;
  job_id: string;
  workspace_id: string;
  vault_locale: string;
  brand_kit: unknown;
  market_intel: unknown;
  reviews: unknown;
  keyword_tracker: unknown;
  competitor_signals: unknown;
  signal_count: number;
  keywords_count: number;
  competitors_count: number;
  review_pains_count: number;
  market_gaps_count: number;
  has_brand_kit: boolean;
  created_at: string;
};

function rowToSnapshot(row: SnapshotRow): VersionSignalSnapshot {
  return {
    id: row.id,
    versionId: row.version_id,
    jobId: row.job_id,
    workspaceId: row.workspace_id,
    vaultLocale: row.vault_locale as "en" | "ar",
    brandKit: (row.brand_kit ?? {}) as VersionSignalSnapshot["brandKit"],
    marketIntel: (row.market_intel ?? {}) as VersionSignalSnapshot["marketIntel"],
    reviews: (row.reviews ?? {}) as VersionSignalSnapshot["reviews"],
    keywordTracker: (row.keyword_tracker ?? {}) as VersionSignalSnapshot["keywordTracker"],
    competitorSignals: (row.competitor_signals ?? {}) as VersionSignalSnapshot["competitorSignals"],
    signalCount: row.signal_count,
    keywordsCount: row.keywords_count,
    competitorsCount: row.competitors_count,
    reviewPainsCount: row.review_pains_count,
    marketGapsCount: row.market_gaps_count,
    hasBrandKit: row.has_brand_kit,
    createdAt: row.created_at,
  };
}

// ─── Signal count derivation ───────────────────────────────────────────────────

export function deriveSignalCounts(ctx: GenerationSignalContext): {
  signalCount: number;
  keywordsCount: number;
  competitorsCount: number;
  reviewPainsCount: number;
  marketGapsCount: number;
  hasBrandKit: boolean;
} {
  const keywordsCount =
    ctx.keywordTracker.highConfidenceKeywords.length +
    ctx.keywordTracker.opportunityKeywords.length;
  const competitorsCount =
    ctx.competitorSignals.weaknesses.length + ctx.competitorSignals.differentiators.length;
  const reviewPainsCount = ctx.reviews.topPainPoints.length;
  const marketGapsCount = ctx.marketIntel.gaps.length;
  const hasBrandKit = !!(ctx.brandKit.style || ctx.brandKit.primaryColor);
  const signalCount =
    keywordsCount +
    competitorsCount +
    reviewPainsCount +
    marketGapsCount +
    (hasBrandKit ? 1 : 0);

  return {
    signalCount,
    keywordsCount,
    competitorsCount,
    reviewPainsCount,
    marketGapsCount,
    hasBrandKit,
  };
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Persists (or updates) the signal snapshot for a generation job.
 * Idempotent via ON CONFLICT on job_id.
 * Non-blocking — the caller should not await in the critical path.
 */
export async function saveVersionSignalSnapshot(
  params: SaveSignalSnapshotParams,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = getSupabaseAdmin();
  const counts = deriveSignalCounts({
    brandKit: params.brandKit,
    marketIntel: params.marketIntel,
    reviews: params.reviews,
    keywordTracker: params.keywordTracker,
    competitorSignals: params.competitorSignals,
  });

  const { data, error } = await admin
    .from("listing_version_signal_snapshots")
    .upsert(
      {
        job_id: params.jobId,
        version_id: params.versionId ?? null,
        workspace_id: params.workspaceId,
        vault_locale: params.vaultLocale,
        brand_kit: params.brandKit,
        market_intel: params.marketIntel,
        reviews: params.reviews,
        keyword_tracker: params.keywordTracker,
        competitor_signals: params.competitorSignals,
        // deriveSignalCounts returns camelCase — map to DB snake_case columns
        signal_count: counts.signalCount,
        keywords_count: counts.keywordsCount,
        competitors_count: counts.competitorsCount,
        review_pains_count: counts.reviewPainsCount,
        market_gaps_count: counts.marketGapsCount,
        has_brand_kit: counts.hasBrandKit,
      },
      { onConflict: "job_id" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[listing-version-signal-snapshots] upsert failed", {
      jobId: params.jobId,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data as { id: string }).id };
}

// ─── Patch version_id once the version row is created ────────────────────────

/**
 * Links an already-saved snapshot to a listing_versions row.
 * Called after createListingVersion() succeeds in the executor.
 */
export async function linkSnapshotToVersion(
  jobId: string,
  versionId: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("listing_version_signal_snapshots")
    .update({ version_id: versionId })
    .eq("job_id", jobId)
    .is("version_id", null);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the signal snapshot for a specific generation job.
 */
export async function getSnapshotByJobId(
  jobId: string,
): Promise<VersionSignalSnapshot | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("listing_version_signal_snapshots")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToSnapshot(data as SnapshotRow);
}

/**
 * Fetches signal snapshots for a list of version IDs.
 * Returns a Map<versionId, VersionSignalSnapshot> for O(1) lookup.
 */
export async function getSnapshotsByVersionIds(
  versionIds: string[],
): Promise<Map<string, VersionSignalSnapshot>> {
  if (versionIds.length === 0) return new Map();

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("listing_version_signal_snapshots")
    .select("*")
    .in("version_id", versionIds);

  if (error || !data) return new Map();

  const map = new Map<string, VersionSignalSnapshot>();
  for (const row of data as SnapshotRow[]) {
    if (row.version_id) {
      map.set(row.version_id, rowToSnapshot(row));
    }
  }
  return map;
}
