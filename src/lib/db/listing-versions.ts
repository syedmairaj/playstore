import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  ListingVersion,
  ListingVersionStatus,
  ScreenshotCaption,
  LiveListingSnapshot,
} from "@/lib/listing/listing-version.types";

// ─── DB row shape ────────────────────────────────────────────────────────────

type ListingVersionRow = {
  id: string;
  workspace_id: string;
  app_id: string | null;
  vault_locale: string;
  version_number: number;
  status: string;
  title: string | null;
  short_description: string | null;
  long_description: string | null;
  keyword_suggestions: unknown;
  cta_suggestions: unknown;
  screenshot_captions: unknown;
  live_listing_snapshot: unknown;
  source_queue_hash: string | null;
  source_job_id: string | null;
  source_generation_id: string | null;
  published_at: string | null;
  deployed_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function rowToVersion(row: ListingVersionRow): ListingVersion {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    appId: row.app_id,
    vaultLocale: row.vault_locale as "en" | "ar",
    versionNumber: row.version_number,
    status: row.status as ListingVersionStatus,
    title: row.title,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    keywordSuggestions: Array.isArray(row.keyword_suggestions)
      ? (row.keyword_suggestions as string[])
      : [],
    ctaSuggestions: Array.isArray(row.cta_suggestions)
      ? (row.cta_suggestions as string[])
      : [],
    screenshotCaptions: Array.isArray(row.screenshot_captions)
      ? (row.screenshot_captions as ScreenshotCaption[])
      : [],
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
  };
}

function admin() {
  return getSupabaseAdmin();
}

// ─── Read operations ─────────────────────────────────────────────────────────

/**
 * List all versions for a workspace/app/locale, newest first.
 */
export async function listListingVersions(params: {
  workspaceId: string;
  appId?: string | null;
  vaultLocale?: "en" | "ar";
  limit?: number;
}): Promise<ListingVersion[]> {
  const { workspaceId, appId, vaultLocale, limit = 20 } = params;

  let query = admin()
    .from("listing_versions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (appId !== undefined) {
    query = appId ? query.eq("app_id", appId) : query.is("app_id", null);
  }
  if (vaultLocale) {
    query = query.eq("vault_locale", vaultLocale);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => rowToVersion(r as ListingVersionRow));
}

/**
 * Fetch a single version by ID (workspace-scoped for safety).
 */
export async function getListingVersion(
  workspaceId: string,
  versionId: string,
): Promise<ListingVersion | null> {
  const { data, error } = await admin()
    .from("listing_versions")
    .select("*")
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToVersion(data as ListingVersionRow);
}

// ─── Write operations ────────────────────────────────────────────────────────

export type CreateListingVersionInput = {
  workspaceId: string;
  appId?: string | null;
  vaultLocale: "en" | "ar";
  createdBy: string;

  // Content — populated either at creation (sync path) or after job completes
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  keywordSuggestions?: string[];
  ctaSuggestions?: string[];
  screenshotCaptions?: ScreenshotCaption[];

  // Provenance
  sourceQueueHash?: string | null;
  sourceJobId?: string | null;
  sourceGenerationId?: string | null;
};

/**
 * Insert a new ListingVersion row.
 * The version_number is computed atomically by the DB function.
 */
export async function createListingVersion(
  input: CreateListingVersionInput,
): Promise<ListingVersion> {
  const db = admin();

  // Resolve the next version number atomically
  const { data: nextNumberData, error: rpcError } = await db.rpc(
    "next_listing_version_number",
    {
      p_workspace_id: input.workspaceId,
      p_app_id: input.appId ?? null,
      p_vault_locale: input.vaultLocale,
    },
  );
  if (rpcError) throw rpcError;

  const { data, error } = await db
    .from("listing_versions")
    .insert({
      workspace_id: input.workspaceId,
      app_id: input.appId ?? null,
      vault_locale: input.vaultLocale,
      version_number: nextNumberData as number,
      status: "draft",
      title: input.title ?? null,
      short_description: input.shortDescription ?? null,
      long_description: input.longDescription ?? null,
      keyword_suggestions: input.keywordSuggestions ?? [],
      cta_suggestions: input.ctaSuggestions ?? [],
      screenshot_captions: input.screenshotCaptions ?? [],
      source_queue_hash: input.sourceQueueHash ?? null,
      source_job_id: input.sourceJobId ?? null,
      source_generation_id: input.sourceGenerationId ?? null,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToVersion(data as ListingVersionRow);
}

/**
 * Back-fill content into a version that was created as a placeholder
 * (status: draft, no title yet).  Called by the worker on job completion.
 */
export async function populateListingVersionContent(
  versionId: string,
  content: {
    title: string;
    shortDescription: string;
    longDescription: string;
    keywordSuggestions?: string[];
    ctaSuggestions?: string[];
    screenshotCaptions?: ScreenshotCaption[];
  },
): Promise<void> {
  const { error } = await admin()
    .from("listing_versions")
    .update({
      title: content.title,
      short_description: content.shortDescription,
      long_description: content.longDescription,
      keyword_suggestions: content.keywordSuggestions ?? [],
      cta_suggestions: content.ctaSuggestions ?? [],
      screenshot_captions: content.screenshotCaptions ?? [],
    })
    .eq("id", versionId);

  if (error) throw error;
}

/**
 * Advance a version's status.
 * draft → published → deployed (linear; can also revert to draft).
 */
export async function transitionListingVersionStatus(
  workspaceId: string,
  versionId: string,
  newStatus: ListingVersionStatus,
): Promise<ListingVersion> {
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "published") patch.published_at = now;
  if (newStatus === "deployed") patch.deployed_at = now;
  if (newStatus === "draft") {
    patch.published_at = null;
    patch.deployed_at = null;
  }

  const { data, error } = await admin()
    .from("listing_versions")
    .update(patch)
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToVersion(data as ListingVersionRow);
}

/**
 * Store (or replace) the live Play Store listing snapshot used for the
 * Deployment View side-by-side comparison.
 */
export async function setLiveListingSnapshot(
  workspaceId: string,
  versionId: string,
  snapshot: LiveListingSnapshot,
): Promise<ListingVersion> {
  const { data, error } = await admin()
    .from("listing_versions")
    .update({ live_listing_snapshot: snapshot })
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToVersion(data as ListingVersionRow);
}

/**
 * Overwrite the screenshot captions on an existing version
 * (e.g. after a standalone captions regeneration step).
 */
export async function updateVersionCaptions(
  workspaceId: string,
  versionId: string,
  captions: ScreenshotCaption[],
): Promise<ListingVersion> {
  const { data, error } = await admin()
    .from("listing_versions")
    .update({ screenshot_captions: captions })
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToVersion(data as ListingVersionRow);
}

/**
 * Back-fill content into the version row linked to a specific job.
 * Called by the worker after a pipeline/full/finalize job completes.
 * No-ops gracefully if no version row has source_job_id = jobId.
 */
export async function populateListingVersionByJobId(
  jobId: string,
  content: {
    title?: string | null;
    shortDescription?: string | null;
    longDescription?: string | null;
    keywordSuggestions?: string[];
    ctaSuggestions?: string[];
    screenshotCaptions?: ScreenshotCaption[];
  },
): Promise<void> {
  const { error } = await admin()
    .from("listing_versions")
    .update({
      ...(content.title !== undefined ? { title: content.title } : {}),
      ...(content.shortDescription !== undefined
        ? { short_description: content.shortDescription }
        : {}),
      ...(content.longDescription !== undefined
        ? { long_description: content.longDescription }
        : {}),
      keyword_suggestions: content.keywordSuggestions ?? [],
      cta_suggestions: content.ctaSuggestions ?? [],
      screenshot_captions: content.screenshotCaptions ?? [],
    })
    .eq("source_job_id", jobId);

  if (error) throw error;
}

/**
 * Update notes on a version.
 */
export async function updateVersionNotes(
  workspaceId: string,
  versionId: string,
  notes: string,
): Promise<ListingVersion> {
  const { data, error } = await admin()
    .from("listing_versions")
    .update({ notes })
    .eq("id", versionId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToVersion(data as ListingVersionRow);
}
