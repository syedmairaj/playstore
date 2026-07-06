/**
 * Listing versioning types — ListingVersion, ScreenshotCaption.
 *
 * A ListingVersion is created automatically when a pipeline/full generation
 * job completes.  Status advances manually: draft → published → deployed.
 * Both EN and AR vault locales are supported.
 */

export type ListingVersionStatus = "draft" | "published" | "deployed";

/** A single screenshot caption generated from the long description tone. */
export type ScreenshotCaption = {
  /** Display order on the Play Store screenshot carousel (1-indexed, 1–8). */
  order: number;
  /** The caption text — max 70 characters for Play Store compliance. */
  caption: string;
  /** Structural role within the Play Store narrative flow. */
  theme: "hook" | "feature" | "benefit" | "cta";
  /**
   * Gemini-generated UI focus description — the screenshot background context
   * (e.g. "minimal dark dashboard with #1A73E8 accent stripe").
   * Feeds into `buildSceneDescriptionForCaption` for richer Runware prompts.
   */
  uiFocus?: string | null;
  /**
   * Fully assembled Runware positive prompt for this caption's background image.
   * Persisted to `listing_versions.screenshot_captions` JSONB so screenshot
   * visual changes can be correlated with CVR metrics in the performance dashboard.
   */
  runwarePrompt?: string | null;
};

/** Live Play Store listing snapshot captured for Deployment View comparison. */
export type LiveListingSnapshot = {
  title: string;
  shortDescription: string;
  longDescription: string;
  /** ISO 8601 timestamp when this snapshot was captured or entered. */
  capturedAt: string;
};

/**
 * A ListingVersion is an immutable snapshot of listing copy that has been
 * promoted from a workspace draft.  Rows are created server-side (service role)
 * when a pipeline job completes; clients read them via the API.
 */
export type ListingVersion = {
  id: string;
  workspaceId: string;
  appId: string | null;
  vaultLocale: "en" | "ar";

  versionNumber: number;
  status: ListingVersionStatus;

  title: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  keywordSuggestions: string[];
  ctaSuggestions: string[];
  screenshotCaptions: ScreenshotCaption[];

  liveListingSnapshot: LiveListingSnapshot | null;

  sourceQueueHash: string | null;
  sourceJobId: string | null;
  sourceGenerationId: string | null;

  publishedAt: string | null;
  deployedAt: string | null;
  notes: string | null;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Output shape from the captions generation step. */
export type CaptionsStepData = {
  /**
   * Screenshot captions with optional `runwarePrompt` embedded on each item.
   * The `runwarePrompt` field IS persisted to `listing_versions.screenshot_captions`
   * JSONB for CVR correlation in the performance attribution dashboard.
   */
  captions: ScreenshotCaption[];
  /**
   * Full Runware payloads (positivePrompt + negativePrompt + dimensions) — one per caption.
   * Convenience duplicate of the `runwarePrompt` strings already embedded in `captions`;
   * consumed directly by the frontend to submit image-generation jobs to Runware.
   */
  runwarePayloads?: import("@/lib/runware/runware-visual-prompt").RunwarePayload[];
};

/** Status transition request body for PATCH /listing-versions/[versionId]. */
export type ListingVersionUpdateBody =
  | { action: "publish" }
  | { action: "deploy" }
  | { action: "revert_to_draft" }
  | { action: "set_live_snapshot"; snapshot: LiveListingSnapshot }
  | { action: "update_captions"; captions: ScreenshotCaption[] }
  | { action: "update_notes"; notes: string };
