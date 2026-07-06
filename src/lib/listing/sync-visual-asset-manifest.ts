import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import type {
  VisualArchetype,
  AssetManifestRef,
  AssetManifestSyncStatus,
  SyncVisualAssetManifestResult,
  GeneratedListingTextContent,
} from "@/lib/listing/asset-manifest.types";
import { logPipelineEvent } from "@/lib/observability/pipeline-health";

// ─────────────────────────────────────────────────────────────────────────────
// Archetype detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Term clusters that map text signals to archetypes.
 * Each cluster is a RegExp tested against a normalised, lowercased concatenation
 * of title + shortDescription + features + hook + closing.
 *
 * Order matters — first match wins.  "generic" is the unconditional fallback.
 */
const ARCHETYPE_PATTERNS: Array<[VisualArchetype, RegExp]> = [
  [
    "teams",
    /\b(team|collaborat|workspace|shared\s+workspace|together|colleague|member|co-work|multi-user|permission|channel|mention|assign|handoff)\b/i,
  ],
  [
    "productivity",
    /\b(task|todo|to-do|workflow|organiz|planner|schedul|remind|priorit|agenda|deadline|track|project|sprint|kanban|efficien|automat)\b/i,
  ],
  [
    "entertainment",
    /\b(video|music|stream|podcast|playlist|media|watch|listen|episode|show|entertain|gaming|play|movie|song|album|cast)\b/i,
  ],
  [
    "health",
    /\b(health|fitness|workout|exercise|diet|nutrition|sleep|meditat|wellness|medical|symptom|calori|weight|step|heart\s*rate|bmr|run|cardio)\b/i,
  ],
  [
    "finance",
    /\b(finance|money|payment|bank|invest|budget|trading|portfolio|stock|crypto|expense|wallet|transfer|saving|earn|income|tax|receipt)\b/i,
  ],
  [
    "education",
    /\b(learn|course|educat|student|teacher|tutor|quiz|lesson|exam|flashcard|study|curriculum|school|language|vocabular|grammar|certif)\b/i,
  ],
  [
    "social",
    /\b(social|community|friend|follow|share|post|comment|like|connect|network|profile|feed|influencer|creator|mention|group|chat|dm)\b/i,
  ],
];

/**
 * Infers the dominant visual archetype from generated listing copy.
 * Returns "generic" when no dominant theme is detected.
 */
export function detectVisualArchetype(
  text: GeneratedListingTextContent,
): VisualArchetype {
  const corpus = [
    text.title ?? "",
    text.shortDescription ?? "",
    text.features ?? "",
    text.hook ?? "",
    text.closing ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!corpus) return "generic";

  for (const [archetype, pattern] of ARCHETYPE_PATTERNS) {
    if (pattern.test(corpus)) return archetype;
  }
  return "generic";
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

type ManifestRow = {
  id: string;
  vault_locale: string;
  queue_hash: string;
  app_id: string | null;
  icon_asset_id: string | null;
  banner_asset_id: string | null;
  screenshot_batch_id: string | null;
  detected_text_archetype: string | null;
  approved_visual_archetype: string | null;
  sync_status: string;
  synced_at: string | null;
  is_manually_overridden: boolean;
};

function rowToRef(row: ManifestRow, workspaceId: string): AssetManifestRef {
  return {
    id: row.id,
    workspaceId,
    appId: row.app_id,
    vaultLocale: row.vault_locale as "en" | "ar",
    queueHash: row.queue_hash,
    iconAssetId: row.icon_asset_id,
    bannerAssetId: row.banner_asset_id,
    screenshotBatchId: row.screenshot_batch_id,
    detectedTextArchetype: (row.detected_text_archetype as VisualArchetype) ?? null,
    approvedVisualArchetype: (row.approved_visual_archetype as VisualArchetype) ?? null,
    syncStatus: row.sync_status as AssetManifestSyncStatus,
    syncedAt: row.synced_at,
    isManuallyOverridden: row.is_manually_overridden ?? false,
  };
}

/**
 * Evaluates sync_status from the detected text archetype and any previously
 * approved visual archetype.
 *
 * Rules:
 *  - If no approved_visual_archetype is set → "synced" (neutral, no conflict)
 *  - If archetypes match → "synced"
 *  - If archetypes differ → "mismatch"
 */
function resolveSyncStatus(
  detectedText: VisualArchetype,
  approvedVisual: VisualArchetype | null,
): AssetManifestSyncStatus {
  if (!approvedVisual) return "synced";
  return detectedText === approvedVisual ? "synced" : "mismatch";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type SyncVisualAssetManifestParams = {
  workspaceId: string;
  appId: string | null;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  jobId?: string;
  /** Text content extracted from the orchestrator result for archetype inference. */
  generatedText: GeneratedListingTextContent;
};

/**
 * Syncs the visual asset manifest for a workspace vault state.
 *
 * Called automatically after a successful listing pipeline (`step: "pipeline"`)
 * or full generation (`step: "full" | "finalize"`) in the QStash worker.
 *
 * What it does:
 *  1. Infers the dominant VisualArchetype from the generated copy.
 *  2. Loads the existing manifest row for this workspace+queueHash (if any).
 *  3. Computes sync_status by comparing the detected text archetype with any
 *     previously approved visual archetype on the manifest.
 *  4. Upserts into `workspace_asset_manifests`.
 *  5. Emits a `visual_alignment_check` pipeline event for observability.
 *
 * This function is best-effort — callers should catch any thrown error and
 * continue; a manifest sync failure must never block listing generation.
 */
export async function syncVisualAssetManifest(
  supabase: SupabaseClient,
  params: SyncVisualAssetManifestParams,
): Promise<SyncVisualAssetManifestResult> {
  const { workspaceId, appId, vaultLocale, queueHash, jobId, generatedText } =
    params;

  try {
    const detectedArchetype = detectVisualArchetype(generatedText);

    // ── Load existing manifest row to preserve approved_visual_archetype ──────
    const query = supabase
      .from("workspace_asset_manifests")
      .select(
        "id, vault_locale, queue_hash, app_id, icon_asset_id, banner_asset_id, " +
          "screenshot_batch_id, detected_text_archetype, approved_visual_archetype, " +
          "sync_status, synced_at, is_manually_overridden",
      )
      .eq("workspace_id", workspaceId)
      .eq("vault_locale", vaultLocale)
      .eq("queue_hash", queueHash);

    if (appId) {
      query.eq("app_id", appId);
    } else {
      query.is("app_id", null);
    }

    const { data: existing } = await query.maybeSingle();

    // ── Safety guard: skip auto-sync for manually-overridden manifests ─────────
    if (existing?.is_manually_overridden) {
      const manifest = rowToRef(existing as ManifestRow, workspaceId);
      logPipelineEvent("visual_alignment_check", {
        workspaceId,
        vaultLocale,
        queueHash,
        message: "Auto-sync skipped — manifest is manually overridden.",
        meta: { isManuallyOverridden: true, manifestId: existing.id },
      });
      return { ok: true, manifest, syncStatus: manifest.syncStatus };
    }

    const approvedVisualArchetype =
      (existing?.approved_visual_archetype as VisualArchetype | null) ?? null;
    const syncStatus = resolveSyncStatus(detectedArchetype, approvedVisualArchetype);
    const now = new Date().toISOString();

    // ── Upsert manifest row ────────────────────────────────────────────────────
    const upsertRow = {
      workspace_id: workspaceId,
      app_id: appId,
      vault_locale: vaultLocale,
      queue_hash: queueHash,
      detected_text_archetype: detectedArchetype,
      approved_visual_archetype: approvedVisualArchetype,
      // Preserve existing asset pointers — only the text-pipeline sync touches
      // detected_text_archetype / sync_status.  Asset pointers are set by the
      // screenshot approval flow, not here.
      icon_asset_id: existing?.icon_asset_id ?? null,
      banner_asset_id: existing?.banner_asset_id ?? null,
      screenshot_batch_id: existing?.screenshot_batch_id ?? null,
      sync_status: syncStatus,
      synced_at: now,
      // Never reset a manual override flag from the text pipeline — only
      // syncBrandKitToMockup with force=true may clear it.
      is_manually_overridden: existing?.is_manually_overridden ?? false,
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from("workspace_asset_manifests")
      .upsert(upsertRow, {
        onConflict: appId
          ? "workspace_id,app_id,vault_locale,queue_hash"
          : "workspace_id,vault_locale,queue_hash",
        ignoreDuplicates: false,
      })
      .select(
        "id, vault_locale, queue_hash, app_id, icon_asset_id, banner_asset_id, " +
          "screenshot_batch_id, detected_text_archetype, approved_visual_archetype, " +
          "sync_status, synced_at, is_manually_overridden",
      )
      .single();

    if (upsertErr || !upserted) {
      const msg = upsertErr?.message ?? "upsert returned no data";
      console.error(
        JSON.stringify({
          event: "sync_visual_asset_manifest_failed",
          workspaceId,
          queueHash,
          vaultLocale,
          error: msg,
        }),
      );
      return { ok: false, error: msg };
    }

    const manifest = rowToRef(upserted as ManifestRow, workspaceId);

    // ── Emit observability event ───────────────────────────────────────────────
    logPipelineEvent("visual_alignment_check", {
      workspaceId,
      vaultLocale,
      queueHash,
      ...(jobId ? { jobId } : {}),
      message: `Visual alignment check — text archetype: ${detectedArchetype}, visual archetype: ${approvedVisualArchetype ?? "none"}, status: ${syncStatus}`,
      meta: {
        detectedTextArchetype: detectedArchetype,
        approvedVisualArchetype: approvedVisualArchetype ?? null,
        syncStatus,
        appId: appId ?? null,
      },
    });

    return { ok: true, manifest, syncStatus };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "sync_visual_asset_manifest_unexpected_error",
        workspaceId,
        queueHash,
        error: message,
      }),
    );
    return { ok: false, error: message };
  }
}
