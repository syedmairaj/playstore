import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OptimizationQueueLocale,
  OptimizationQueueSource,
} from "@/lib/optimization-queue/optimization-queue.types";
import { readOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";
import {
  SIGNAL_LIFECYCLE_STATUS,
  readSignalLifecycleStatus,
} from "@/lib/signals/signal-lifecycle";
import type {
  VisualAlignmentWarning,
  VisualArchetype,
} from "@/lib/listing/asset-manifest.types";

export type { VisualAlignmentWarning };

export type IntelModuleBlockReason =
  | "competitor_spy"
  | "review_analysis"
  | "market_intel";

/**
 * One discovery item in the blocking result — enough detail for server-side
 * logging and to let the client show the user exactly what needs review.
 */
export type DiscoveryBlockingItem = {
  id: string;
  /** Truncated to 80 chars for safe embedding in logs and error responses. */
  contentPreview: string;
  stagedAt?: string;
};

export type IntelModulesCheckResult =
  | { blocked: false; visualWarnings: VisualAlignmentWarning[] }
  | {
      blocked: true;
      module: IntelModuleBlockReason;
      discoveryCount: number;
      message: string;
      /** Up to 5 blocking items — IDs + truncated content for diagnostics. */
      blockingItems: DiscoveryBlockingItem[];
      visualWarnings: VisualAlignmentWarning[];
    };

/**
 * Sources that represent intel modules — distinct from keyword_tracker and
 * manual entries which are always curated before reaching the active context.
 */
const INTEL_SOURCES: OptimizationQueueSource[] = [
  "competitor_spy",
  "review_analysis",
  "market_intel",
];

const MODULE_DISPLAY_NAMES: Record<IntelModuleBlockReason, string> = {
  competitor_spy: "Competitor Spy",
  review_analysis: "Review Insights",
  market_intel: "Market Intel",
};

// ─────────────────────────────────────────────────────────────────────────────
// Visual alignment check (non-blocking warning)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queries `workspace_asset_manifests` for the current vault state and returns a
 * VisualAlignmentWarning when the detected text archetype does not match the
 * approved visual archetype stored on the manifest.
 *
 * This is a WARNING, not a hard block — generation can proceed, but the client
 * should surface the mismatch so the user can decide whether to update their
 * screenshots or continue anyway.
 *
 * Returns an empty array when:
 *  - No manifest row exists for this queueHash (first generation)
 *  - sync_status is "pending" or "synced"
 */
async function collectVisualAlignmentWarnings(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId: string | null,
  queueHash: string,
): Promise<VisualAlignmentWarning[]> {
  try {
    const query = supabase
      .from("workspace_asset_manifests")
      .select("sync_status, detected_text_archetype, approved_visual_archetype")
      .eq("workspace_id", workspaceId)
      .eq("vault_locale", locale)
      .eq("queue_hash", queueHash);

    if (appId) {
      query.eq("app_id", appId);
    } else {
      query.is("app_id", null);
    }

    const { data: manifest } = await query.maybeSingle();

    if (!manifest || manifest.sync_status !== "mismatch") return [];

    const detected = manifest.detected_text_archetype as VisualArchetype | null;
    const approved = manifest.approved_visual_archetype as VisualArchetype | null;

    return [
      {
        code: "visual_text_mismatch",
        severity: "warning",
        detectedTextArchetype: detected,
        approvedVisualArchetype: approved,
        message: `Your listing copy focuses on '${detected ?? "unknown"}' but your approved screenshots target '${approved ?? "unknown"}'. Consider updating your screenshots or regenerating to match.`,
      },
    ];
  } catch {
    // Non-fatal — never block generation because of a manifest query error.
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type CheckIntelModulesOptions = {
  /**
   * When provided, the function also checks `workspace_asset_manifests` for
   * the current vault state and returns a VisualAlignmentWarning if the
   * detected text archetype does not match the approved visual archetype.
   * This is a non-blocking warning — generation can proceed.
   */
  queueHash?: string;

  /**
   * Items in DISCOVERY state that were staged more than this many milliseconds
   * ago are considered "stale discovery" and do NOT block generation.
   *
   * Rationale: the guard is intended to catch intel that is ACTIVELY BEING
   * FETCHED (last run of competitor spy / review analysis).  Items that have
   * been sitting in DISCOVERY for longer than this window have already been
   * seen by the user and the system should not perpetually block generation on
   * them.  A fresh analysis run will set new items with a recent `stagedAt`,
   * which WILL still trigger the block.
   *
   * Defaults to DISCOVERY_STALE_WINDOW_MS (24 hours).
   * Set to 0 to always block on ANY DISCOVERY item (strict mode).
   */
  discoveryStaleWindowMs?: number;
};

/**
 * 24-hour stale-discovery window — items staged more than 24 hours ago in
 * DISCOVERY state are not treated as "actively fetching" and do not block.
 */
const DISCOVERY_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Pre-generation guard — returns `blocked: true` (HTTP 423 Locked) when any
 * intel module has FRESH competitor_strength signals in DISCOVERY lifecycle
 * state (staged within the last `discoveryStaleWindowMs`).
 *
 * ── Why only competitor_strength? ──────────────────────────────────────────
 * `readSignalLifecycleStatus` returns `undefined` for all item types except
 * `competitor_strength`.  Review and Market Intel items carry no lifecycle
 * status, so the guard only applies to the Competitor Spy module.
 *
 * ── Why the stale-discovery window? ────────────────────────────────────────
 * The queue hash counts items regardless of lifecycle status, so a workspace
 * can have `hashFullyPopulated: true` while still having DISCOVERY items.
 * Without the window, the 423 fires indefinitely until the user manually
 * promotes every competitor — even though the user staged those items days
 * ago and clearly intended to use them.  The window limits the block to
 * items freshly added by a concurrent analysis run.
 *
 * Additionally, when `options.queueHash` is provided, runs a secondary
 * non-blocking check for visual/text archetype mismatches on the asset
 * manifest.  Skipped for instantDraft / fastDraft paths.
 *
 * Note: auto-derived `review_pain_point` items are excluded from
 * `readOptimizationQueue` so they are never evaluated here.
 */
export async function checkIntelModulesReady(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId: string | null,
  options?: CheckIntelModulesOptions,
): Promise<IntelModulesCheckResult> {
  const staleWindowMs =
    options?.discoveryStaleWindowMs !== undefined
      ? options.discoveryStaleWindowMs
      : DISCOVERY_STALE_WINDOW_MS;
  const now = Date.now();

  const [items, visualWarnings] = await Promise.all([
    readOptimizationQueue(supabase, workspaceId, locale, appId),
    options?.queueHash
      ? collectVisualAlignmentWarnings(
          supabase,
          workspaceId,
          locale,
          appId,
          options.queueHash,
        )
      : Promise.resolve<VisualAlignmentWarning[]>([]),
  ]);

  for (const source of INTEL_SOURCES) {
    const freshDiscoveryItems = items.filter((item) => {
      if ((item.source as OptimizationQueueSource) !== source) return false;
      if (readSignalLifecycleStatus(item) !== SIGNAL_LIFECYCLE_STATUS.DISCOVERY) return false;

      // Stale-discovery exclusion: items staged more than `staleWindowMs` ago
      // are NOT treated as "actively fetching".  Only items with a very recent
      // stagedAt timestamp (same order as a new analysis run) remain blocking.
      if (staleWindowMs > 0 && item.stagedAt) {
        const ageMs = now - new Date(item.stagedAt).getTime();
        if (ageMs > staleWindowMs) return false;
      }

      return true;
    });

    if (freshDiscoveryItems.length === 0) continue;

    const displayName = MODULE_DISPLAY_NAMES[source as IntelModuleBlockReason];
    const n = freshDiscoveryItems.length;

    const blockingItems: DiscoveryBlockingItem[] = freshDiscoveryItems
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        contentPreview: (item.content ?? "").slice(0, 80),
        stagedAt: item.stagedAt,
      }));

    return {
      blocked: true,
      module: source as IntelModuleBlockReason,
      discoveryCount: n,
      message: `${displayName} has ${n} uncurated signal${n !== 1 ? "s" : ""} in discovery state. Review your intel before generating.`,
      blockingItems,
      visualWarnings,
    };
  }

  return { blocked: false, visualWarnings };
}
