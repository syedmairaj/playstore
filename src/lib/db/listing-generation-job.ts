import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import type {
  ListingGenerationJobPayload,
  ListingGenerationJobResult,
  ListingGenerationJobStatus,
  ListingGenerationPhase,
} from "@/lib/listing/listing-generation-job.types";
import { computePersistedPhases, upsertWorkspaceListingDraftRow } from "@/lib/db/workspace-listing-drafts";
import {
  EMPTY_MODULAR_LISTING_STATE,
  type ModularListingState,
} from "@/lib/listing/modular-listing.types";
import type { PartialListingContent } from "@/lib/listing/pipeline-progress.types";
import { shortVariationText } from "@/lib/listing/modular-short-variations";

export type ListingGenerationJobRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  queue_hash: string;
  vault_locale: OptimizationQueueLocale;
  job_id: string | null;
  generation_status: ListingGenerationJobStatus | null;
  generation_error: string | null;
  current_phase: ListingGenerationPhase | null;
  generation_payload: ListingGenerationJobPayload | null;
  generation_result: ListingGenerationJobResult | null;
  modular_listing: unknown;
  updated_at: string;
};

function adminClient() {
  return getSupabaseAdmin();
}

/**
 * How long (ms) a job may sit in "pending" or "processing" before it is
 * considered a zombie and excluded from the active-job look-up.
 *
 * If a worker crashed or the route timed-out the DB row is never advanced to
 * "completed" / "failed".  Returning that stale job to a new generate request
 * would cause the client to poll a dead job indefinitely.  Setting this to
 * 8 minutes is conservative enough to cover the longest realistic pipeline
 * (3 LLM calls ≈ 90 s) while still evicting genuinely stuck jobs promptly.
 */
const ACTIVE_JOB_STALE_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes

/** Error message stamped on async jobs superseded by a sync instant-draft run. */
export const LISTING_GENERATION_SUPERSEDED_ERROR =
  "Superseded by instant draft generation";

/**
 * Mark any in-flight async job for this queue hash as failed so polling stops
 * and late worker completions do not overwrite a fresher instant-draft write.
 */
export async function supersedeActiveListingGenerationJobs(
  workspaceId: string,
  queueHash: string,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("workspace_listing_drafts")
    .update({
      generation_status: "failed",
      generation_error: LISTING_GENERATION_SUPERSEDED_ERROR,
    })
    .eq("workspace_id", workspaceId)
    .eq("queue_hash", queueHash)
    .in("generation_status", ["pending", "processing"]);

  if (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_supersede_failed",
        workspaceId,
        queueHash,
        message: error.message,
      }),
    );
  }
}

/** Clear async job tracking after a successful instant-draft sync run. */
export async function clearListingGenerationJobState(
  workspaceId: string,
  queueHash: string,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("workspace_listing_drafts")
    .update({
      job_id: null,
      generation_status: null,
      generation_error: null,
      current_phase: null,
      generation_payload: null,
      generation_result: null,
    })
    .eq("workspace_id", workspaceId)
    .eq("queue_hash", queueHash);

  if (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_job_clear_failed",
        workspaceId,
        queueHash,
        message: error.message,
      }),
    );
  }
}

export async function findActiveJobByQueueHash(
  workspaceId: string,
  queueHash: string,
): Promise<{ jobId: string; status: ListingGenerationJobStatus } | null> {
  const admin = adminClient();
  const staleThreshold = new Date(Date.now() - ACTIVE_JOB_STALE_THRESHOLD_MS).toISOString();

  const { data } = await admin
    .from("workspace_listing_drafts")
    .select("job_id, generation_status")
    .eq("workspace_id", workspaceId)
    .eq("queue_hash", queueHash)
    .in("generation_status", ["pending", "processing"])
    // Exclude zombie jobs: a row that hasn't been updated in 8 minutes while
    // still in an active status means the worker crashed or was killed.
    // Creating a fresh job (with upsert) is safer than re-attaching the client
    // to a dead poll target.
    .gt("updated_at", staleThreshold)
    .maybeSingle();

  if (!data?.job_id || !data.generation_status) return null;
  return {
    jobId: data.job_id as string,
    status: data.generation_status as ListingGenerationJobStatus,
  };
}

export async function createListingGenerationJob(params: {
  workspaceId: string;
  userId: string;
  appId?: string | null;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  payload: ListingGenerationJobPayload;
  jobId?: string;
}): Promise<{ jobId: string; status: ListingGenerationJobStatus }> {
  const admin = adminClient();
  const jobId = params.jobId ?? crypto.randomUUID();

  const row = {
    workspace_id: params.workspaceId,
    user_id: params.userId,
    app_id: params.appId ?? null,
    vault_locale: params.vaultLocale,
    queue_hash: params.queueHash,
    job_id: jobId,
    generation_status: "pending" as const,
    generation_error: null,
    current_phase: null,
    generation_payload: params.payload,
    generation_result: null,
    modular_listing: EMPTY_MODULAR_LISTING_STATE,
  };

  const upsert = await upsertWorkspaceListingDraftRow(admin, row);
  if (!upsert.ok) {
    throw new Error(`Failed to create listing generation job: ${upsert.message}`);
  }

  return { jobId, status: "pending" };
}

export async function loadListingGenerationJob(
  jobId: string,
): Promise<ListingGenerationJobRow | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("workspace_listing_drafts")
    .select(
      "id, workspace_id, user_id, queue_hash, vault_locale, job_id, generation_status, generation_error, current_phase, generation_payload, generation_result, modular_listing, updated_at",
    )
    .eq("job_id", jobId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ListingGenerationJobRow;
}

export async function updateListingGenerationJob(
  jobId: string,
  patch: {
    status?: ListingGenerationJobStatus;
    currentPhase?: ListingGenerationPhase | null;
    error?: string | null;
    result?: ListingGenerationJobResult | null;
  },
): Promise<void> {
  const admin = adminClient();
  const updates: Record<string, unknown> = {};
  if (patch.status != null) updates.generation_status = patch.status;
  if (patch.currentPhase !== undefined) updates.current_phase = patch.currentPhase;
  if (patch.error !== undefined) updates.generation_error = patch.error;
  if (patch.result !== undefined) updates.generation_result = patch.result;

  if (Object.keys(updates).length === 0) return;

  const { error } = await admin
    .from("workspace_listing_drafts")
    .update(updates)
    .eq("job_id", jobId);

  if (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_job_update_failed",
        jobId,
        message: error.message,
      }),
    );
  }
}

/**
 * Extract human-readable partial content from the modular_listing jsonb column.
 * This is populated incrementally as each pipeline phase writes its result to
 * workspace_listing_drafts — enabling progressive UI updates during generation.
 */
function extractPartialContent(modular: unknown): PartialListingContent {
  const s = (modular ?? {}) as Partial<ModularListingState>;

  const title =
    typeof s.title?.value === "string" && s.title.value.trim()
      ? s.title.value.trim()
      : null;

  const variations = s.shortDescription?.variations ?? [];
  const selectedIdx = s.shortDescription?.selectedIndex ?? 0;
  const selectedVariation = variations[selectedIdx];
  const shortRaw = selectedVariation
    ? shortVariationText(selectedVariation)
    : null;
  const shortDescription =
    typeof shortRaw === "string" && shortRaw.trim() ? shortRaw.trim() : null;

  const long = s.longDescription;
  const longParts = [long?.hook, long?.features, long?.closing]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  const longDescription = longParts.length > 0 ? longParts.join("\n\n") : null;

  return { title, shortDescription, longDescription };
}

export function buildJobStatusResponse(
  row: ListingGenerationJobRow,
): import("@/lib/listing/listing-generation-job.types").ListingGenerationJobStatusResponse {
  const modular =
    row.modular_listing && typeof row.modular_listing === "object"
      ? row.modular_listing
      : EMPTY_MODULAR_LISTING_STATE;
  const persisted = computePersistedPhases(
    modular as ModularListingState,
  );

  return {
    ok: true,
    jobId: row.job_id!,
    workspaceId: row.workspace_id,
    queueHash: row.queue_hash,
    status: row.generation_status,
    currentPhase: row.current_phase,
    phases: {
      title: persisted.title,
      short: persisted.short,
      long: persisted.long,
      full: row.generation_status === "completed" && row.generation_result != null,
    },
    error: row.generation_error,
    result: row.generation_result,
    draftUpdatedAt: row.updated_at,
    partialContent: extractPartialContent(modular),
  };
}

export async function assertJobWorkspaceMember(
  supabase: SupabaseClient,
  job: ListingGenerationJobRow,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", job.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
