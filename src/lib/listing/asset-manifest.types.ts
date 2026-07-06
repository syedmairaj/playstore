/**
 * Visual archetype — the dominant value-proposition theme inferred from
 * generated listing copy (title + short description + features text).
 *
 * Used to detect misalignment between the text pipeline output and the
 * currently approved screenshot set.  When the archetypes differ, the system
 * surfaces a non-blocking "Visual/Text Mismatch" warning at generate time.
 */
export type VisualArchetype =
  | "teams"          // Collaboration, shared workspace, team workflows
  | "productivity"   // Task management, scheduling, efficiency
  | "entertainment"  // Video, music, streaming, media
  | "health"         // Fitness, wellness, medical, exercise
  | "finance"        // Payments, banking, budgeting, investing
  | "education"      // Learning, courses, quizzes, tutoring
  | "social"         // Community, sharing, social connections
  | "generic";       // No dominant theme detected

/**
 * Alignment state of the workspace_asset_manifests row:
 *   pending  → text archetype detected but not yet compared with screenshots
 *   synced   → archetypes match (or no approved visual archetype is set)
 *   mismatch → text and visual archetypes diverge
 */
export type AssetManifestSyncStatus = "pending" | "synced" | "mismatch";

/**
 * Snapshot of the `workspace_asset_manifests` row for a specific vault state.
 * Returned by syncVisualAssetManifest and stored in the DB.
 */
export type AssetManifestRef = {
  id: string;
  workspaceId: string;
  appId: string | null;
  vaultLocale: "en" | "ar";
  queueHash: string;
  iconAssetId: string | null;
  bannerAssetId: string | null;
  screenshotBatchId: string | null;
  detectedTextArchetype: VisualArchetype | null;
  approvedVisualArchetype: VisualArchetype | null;
  syncStatus: AssetManifestSyncStatus;
  syncedAt: string | null;
  /**
   * When true the auto-sync engine (syncBrandKitToMockup) skips this manifest.
   * Cleared by a force-revert ("Revert to Brand Assets").
   */
  isManuallyOverridden: boolean;
};

// ── Brand Kit sync engine types ────────────────────────────────────────────────

export type BrandKitSyncAssetType = "icon" | "banner" | "screenshot" | "all";

export type BrandKitSyncResult = {
  updated: number;
  skippedManualOverride: number;
  markedMismatch: number;
  errors: number;
  totalManifests: number;
};

/**
 * Non-blocking warning surfaced at generate time when the detected text
 * archetype does not match the approved visual archetype.
 *
 * This is a WARN, not a hard block — generation can proceed, but the user
 * should be informed that their screenshots may not match the new copy.
 */
export type VisualAlignmentWarning = {
  code: "visual_text_mismatch";
  severity: "warning";
  detectedTextArchetype: VisualArchetype | null;
  approvedVisualArchetype: VisualArchetype | null;
  message: string;
};

/**
 * Result of syncVisualAssetManifest.
 */
export type SyncVisualAssetManifestResult =
  | { ok: true; manifest: AssetManifestRef; syncStatus: AssetManifestSyncStatus }
  | { ok: false; error: string };

/**
 * Text content extracted from the orchestrator result for archetype detection.
 */
export type GeneratedListingTextContent = {
  title?: string;
  shortDescription?: string;
  features?: string;
  hook?: string;
  closing?: string;
};
