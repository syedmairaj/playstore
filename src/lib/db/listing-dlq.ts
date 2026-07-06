import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { updateListingGenerationJob } from "@/lib/db/listing-generation-job";
import type {
  ListingGenerationJobPayload,
  ListingGenerationJobResult,
} from "@/lib/listing/listing-generation-job.types";

/**
 * Machine-readable event codes for DLQ entries.
 *
 * - write_unverified:   The completion UPDATE to workspace_listing_drafts could
 *                       not be confirmed via a subsequent SELECT (DB write failed
 *                       silently or the row was missing after the update).
 * - malformed_generation: The row was written with status=completed but the
 *                       generated fields (title / short / long) are empty or
 *                       structurally invalid.
 * - worker_error:       A fatal unhandled exception in the worker pipeline
 *                       that should not be retried without investigation.
 */
export type DlqFailureEvent =
  | "write_unverified"
  | "malformed_generation"
  | "worker_error";

export type WriteToDlqParams = {
  jobId: string;
  workspaceId: string;
  queueHash: string;
  vaultLocale: "en" | "ar";
  step: string;
  /** Human-readable message — written to the job's generation_error column. */
  failureReason: string;
  /** Machine-readable code for log aggregators and alerting rules. */
  failureEvent: DlqFailureEvent;
  /** Full generation payload captured for manual replay / retry. */
  generationPayload?: ListingGenerationJobPayload | null;
  /** Result present at DLQ time (null for write_unverified failures). */
  generationResult?: ListingGenerationJobResult | null;
};

/**
 * Writes a failed generation job to the `listing_dlq` table and atomically
 * marks the source job as `failed_permanently`.
 *
 * `failed_permanently` is a terminal status that stops the client polling loop
 * immediately — the user sees a persistent error rather than waiting for a
 * timeout.  The original job row is preserved; only its status and error fields
 * are overwritten.
 *
 * Best-effort: if the DLQ INSERT itself fails, the error is logged but never
 * re-thrown so a DLQ write failure cannot interrupt the error-handling path.
 * The job status update is attempted regardless of the INSERT result.
 */
export async function writeToDlq(params: WriteToDlqParams): Promise<void> {
  const admin = getSupabaseAdmin();

  // Mark the source job as permanently failed so the polling endpoint
  // returns a terminal state immediately — no further QStash retries needed.
  await updateListingGenerationJob(params.jobId, {
    status: "failed_permanently",
    error: `[DLQ:${params.failureEvent}] ${params.failureReason}`,
  });

  const { error } = await admin.from("listing_dlq").insert({
    job_id: params.jobId,
    workspace_id: params.workspaceId,
    queue_hash: params.queueHash,
    vault_locale: params.vaultLocale,
    step: params.step,
    failure_event: params.failureEvent,
    failure_reason: params.failureReason,
    generation_payload: params.generationPayload ?? null,
    generation_result: params.generationResult ?? null,
  });

  if (error) {
    // The DLQ write itself failed — log at error level so monitoring alerts
    // fire.  The job is already marked failed_permanently so the client
    // does not hang, but the payload is lost for replay.
    console.error(
      JSON.stringify({
        event: "dlq_write_failed",
        correlationId: params.queueHash,
        jobId: params.jobId,
        workspaceId: params.workspaceId,
        failureEvent: params.failureEvent,
        dbErrorCode: error.code,
        dbErrorMessage: error.message,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        event: "dlq_write_success",
        correlationId: params.queueHash,
        jobId: params.jobId,
        workspaceId: params.workspaceId,
        failureEvent: params.failureEvent,
      }),
    );
  }
}
