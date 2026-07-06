import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssetManifestSyncStatus,
  BrandKitSyncAssetType,
  BrandKitSyncResult,
  VisualArchetype,
} from "@/lib/listing/asset-manifest.types";
import { logPipelineEvent } from "@/lib/observability/pipeline-health";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Re-evaluates sync_status from the archetype pair already stored on the row. */
function resolveSyncStatus(
  detected: VisualArchetype | null,
  approved: VisualArchetype | null,
): AssetManifestSyncStatus {
  if (!detected || !approved) return "synced"; // neutral — no conflict possible
  return detected === approved ? "synced" : "mismatch";
}

type BrandAssetRow = {
  id: string;
  asset_type: string;
  meta: Record<string, unknown> | null;
};

type ManifestRow = {
  id: string;
  workspace_id: string;
  app_id: string | null;
  vault_locale: string;
  queue_hash: string;
  is_manually_overridden: boolean;
  icon_asset_id: string | null;
  banner_asset_id: string | null;
  screenshot_batch_id: string | null;
  detected_text_archetype: VisualArchetype | null;
  approved_visual_archetype: VisualArchetype | null;
  sync_status: AssetManifestSyncStatus;
};

// ─────────────────────────────────────────────────────────────────────────────
// syncBrandKitToMockup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Propagates the latest approved Brand Kit assets to all `workspace_asset_manifests`
 * rows for the given workspace.
 *
 * Integrity guards:
 *  • If a manifest's `screenshot_batch_id` has an active (pending / running)
 *    `screenshot_jobs` row, the asset pointer is NOT mutated in-place.
 *    Instead the `sync_status` is set to `mismatch` so the user can see the
 *    assets are out-of-sync with the active generation.
 *  • If `is_manually_overridden = true` and `force = false`, the manifest is
 *    skipped entirely and counted under `skippedManualOverride`.
 *
 * @param supabase  Admin Supabase client (bypasses RLS).
 * @param workspaceId  Target workspace.
 * @param assetType  Which asset pointer(s) to sync.  "all" syncs all three.
 * @param options.force  When true, also overwrites manually-overridden manifests
 *                       and clears the `is_manually_overridden` flag.
 * @param options.appId  Optional app filter.  null = workspace-level manifests only.
 */
export async function syncBrandKitToMockup(
  supabase: SupabaseClient,
  workspaceId: string,
  assetType: BrandKitSyncAssetType,
  options?: { force?: boolean; appId?: string | null },
): Promise<BrandKitSyncResult> {
  const force = options?.force ?? false;

  // ── 1. Load latest brand assets for each required type ───────────────────
  const types: Array<"icon" | "banner" | "screenshot"> =
    assetType === "all" ? ["icon", "banner", "screenshot"] : [assetType];

  const latestAssets: Partial<Record<"icon" | "banner" | "screenshot", BrandAssetRow>> = {};

  await Promise.all(
    types.map(async (t) => {
      const { data } = await supabase
        .from("brand_assets")
        .select("id, asset_type, meta")
        .eq("workspace_id", workspaceId)
        .eq("asset_type", t)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) latestAssets[t] = data as BrandAssetRow;
    }),
  );

  // ── 2. Load all workspace manifests ──────────────────────────────────────
  let manifestQuery = supabase
    .from("workspace_asset_manifests")
    .select(
      "id, workspace_id, app_id, vault_locale, queue_hash, is_manually_overridden, " +
        "icon_asset_id, banner_asset_id, screenshot_batch_id, " +
        "detected_text_archetype, approved_visual_archetype, sync_status",
    )
    .eq("workspace_id", workspaceId);

  if (options?.appId !== undefined) {
    if (options.appId) {
      manifestQuery = manifestQuery.eq("app_id", options.appId);
    } else {
      manifestQuery = manifestQuery.is("app_id", null);
    }
  }

  const { data: manifests, error: manifestErr } = await manifestQuery;
  if (manifestErr || !manifests) {
    return { updated: 0, skippedManualOverride: 0, markedMismatch: 0, errors: 1, totalManifests: 0 };
  }

  // ── 3. Process each manifest ──────────────────────────────────────────────
  const result: BrandKitSyncResult = {
    updated: 0,
    skippedManualOverride: 0,
    markedMismatch: 0,
    errors: 0,
    totalManifests: manifests.length,
  };

  for (const manifest of manifests as ManifestRow[]) {
    try {
      // Guard: skip manually-overridden manifests unless force-sync
      if (manifest.is_manually_overridden && !force) {
        result.skippedManualOverride++;
        continue;
      }

      // Guard: if a screenshot job is active (pending / running) don't mutate
      // the asset pointers — mark mismatch instead so the user sees the gap.
      const hasActiveJob = await checkActiveScreenshotJob(supabase, manifest);
      if (hasActiveJob) {
        await supabase
          .from("workspace_asset_manifests")
          .update({ sync_status: "mismatch", updated_at: new Date().toISOString() })
          .eq("id", manifest.id);
        result.markedMismatch++;

        await logPipelineEvent({
          event: "visual_alignment_check",
          workspaceId,
          queueHash: manifest.queue_hash,
          severity: "warning",
          data: {
            reason: "active_screenshot_job_blocked_sync",
            manifestId: manifest.id,
            assetType,
          },
        });
        continue;
      }

      // Build the patch for this manifest
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (types.includes("icon") && latestAssets.icon) {
        patch.icon_asset_id = latestAssets.icon.id;
      }
      if (types.includes("banner") && latestAssets.banner) {
        patch.banner_asset_id = latestAssets.banner.id;
      }
      if (types.includes("screenshot") && latestAssets.screenshot) {
        // screenshot_batch_id is the external batch reference; when syncing
        // "screenshot" type we only update the pointer if there is no active job.
        patch.screenshot_batch_id = latestAssets.screenshot.id;
      }

      // Re-evaluate sync_status with existing archetype pair
      const newSyncStatus = resolveSyncStatus(
        manifest.detected_text_archetype,
        manifest.approved_visual_archetype,
      );
      patch.sync_status = newSyncStatus;

      // If force-sync, clear the manual override flag
      if (force) {
        patch.is_manually_overridden = false;
      }

      const { error: updateErr } = await supabase
        .from("workspace_asset_manifests")
        .update(patch)
        .eq("id", manifest.id);

      if (updateErr) {
        result.errors++;
        continue;
      }

      result.updated++;

      // Telemetry for every auto-replication
      await logPipelineEvent({
        event: "visual_alignment_check",
        workspaceId,
        queueHash: manifest.queue_hash,
        severity: "info",
        data: {
          reason: force ? "force_revert_to_brand_kit" : "auto_replicate_brand_kit",
          manifestId: manifest.id,
          assetType,
          syncStatus: newSyncStatus,
          forced: force,
        },
      });
    } catch (err) {
      result.errors++;
      console.error(
        JSON.stringify({
          event: "sync_brand_kit_manifest_error",
          manifestId: manifest.id,
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: check for active screenshot jobs
// ─────────────────────────────────────────────────────────────────────────────

async function checkActiveScreenshotJob(
  supabase: SupabaseClient,
  manifest: ManifestRow,
): Promise<boolean> {
  if (!manifest.screenshot_batch_id) return false;

  const { data, error } = await supabase
    .from("screenshot_jobs")
    .select("id")
    .eq("workspace_id", manifest.workspace_id)
    .in("status", ["pending", "running"])
    // screenshot_jobs don't have a batch_id FK per-se; we match on the id
    // stored as screenshot_batch_id on the manifest (the job that generated
    // the current screenshot set).
    .eq("id", manifest.screenshot_batch_id)
    .limit(1)
    .maybeSingle();

  if (error) return false; // conservative — don't block on query errors
  return !!data;
}
