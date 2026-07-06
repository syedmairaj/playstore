import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runListingGenerationWorkerJob } from "@/lib/listing/listing-generation-executor";
import { verifyQStashRequest } from "@/lib/qstash/verify-qstash-request";
import { loadListingGenerationJob, updateListingGenerationJob } from "@/lib/db/listing-generation-job";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateActiveContextQueueHash } from "@/lib/optimization-queue/validate-active-context-queue-hash";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { redis } from "@/lib/redis/redis-client";
import {
  generationQueueLockKey,
  GENERATION_QUEUE_LOCK_TTL_SECONDS,
} from "@/lib/listing/generation-queue-hash-lock";
import { logPipelineEvent } from "@/lib/observability/pipeline-health";
import {
  compileContextForStep,
  type CompiledContext,
} from "@/lib/listing/context-gateway";
import { ModularPhaseOrderError } from "@/lib/listing/modular-phase-guard";

export const maxDuration = 300;

/**
 * Heartbeat interval: refresh the Redis queue-hash lock TTL every N seconds
 * while the worker is running so a long Gemini call doesn't expire the lock
 * and allow a duplicate pipeline to start.
 *
 * Must be shorter than GENERATION_QUEUE_LOCK_TTL_SECONDS (300 s) to ensure
 * there is always headroom between refreshes.
 */
const LOCK_HEARTBEAT_INTERVAL_MS = 60_000; // 1 minute

function startLockHeartbeat(workspaceId: string, queueHash: string): () => void {
  const key = generationQueueLockKey(workspaceId, queueHash);
  const timer = setInterval(() => {
    redis.expire(key, GENERATION_QUEUE_LOCK_TTL_SECONDS).catch((err) => {
      console.warn(
        JSON.stringify({
          event: "lock_heartbeat_failed",
          workspaceId,
          queueHash,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }, LOCK_HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(timer);
}

const bodySchema = z.object({
  jobId: z.string().uuid(),
});

/**
 * QStash consumer — runs modular listing generation asynchronously.
 *
 * Vault Hash Check (before orchestration):
 * Re-computes the active-context queue hash from the live vault and compares it
 * against the hash that was stamped at enqueue time. A mismatch means the user
 * mutated the optimization queue after the producer accepted the job, making the
 * compiled context stale. We abort early (409) rather than generating against
 * outdated signals.
 *
 * This check runs for both EN and AR vault branches — the payload's `vaultLocale`
 * field drives which branch is validated.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const verified = await verifyQStashRequest(request, rawBody);
  if (!verified) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Invalid worker signature" } },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "Invalid worker payload" } },
      { status: 400 },
    );
  }

  // ── Vault Hash Check ─────────────────────────────────────────────────────────
  // Load the job payload early so we have workspaceId / queueHash / vaultLocale
  // available for the staleness guard — before handing off to the executor which
  // would run the full Gemini pipeline.
  const admin = getSupabaseAdmin();
  const job = await loadListingGenerationJob(parsed.jobId);

  if (!job?.generation_payload) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "job_not_found", message: `No job found for id: ${parsed.jobId}` },
      },
      { status: 404 },
    );
  }

  if (job.generation_status === "completed") {
    // QStash may re-deliver; idempotent skip.
    return NextResponse.json({ ok: true, jobId: parsed.jobId, skipped: true });
  }

  const { workspaceId } = job.generation_payload;
  const queueHash = job.generation_payload.body.queueHash;
  const vaultLocale = (job.vault_locale ?? job.generation_payload.body.vaultLocale) as OptimizationQueueLocale;
  const appId = job.generation_payload.body.appId ?? null;

  const vaultValidation = await validateActiveContextQueueHash(admin, {
    workspaceId,
    locale: vaultLocale,
    appId,
    clientQueueHash: queueHash,
  });

  if (!vaultValidation.ok) {
    logPipelineEvent("STALE_VAULT_CONTEXT", {
      jobId: parsed.jobId,
      workspaceId,
      vaultLocale,
      queueHash,
      serverQueueHash: vaultValidation.serverQueueHash,
      message: "Vault context stale — optimization queue changed after enqueue",
      meta: {
        appId: appId ?? null,
        itemCount: vaultValidation.itemCount,
        signalBreakdown: vaultValidation.signalBreakdown,
      },
    });

    // Mark job failed so the client polling loop surfaces a clear error.
    await updateListingGenerationJob(parsed.jobId, {
      status: "failed",
      error:
        "Vault context is stale: the optimization queue was modified after this job was enqueued. Please re-generate.",
    });

    return NextResponse.json(
      {
        ok: false,
        jobId: parsed.jobId,
        error: {
          code: "stale_vault_context",
          message:
            "Active context is out of date. The optimization queue changed after this job was enqueued.",
          clientQueueHash: queueHash,
          serverQueueHash: vaultValidation.serverQueueHash,
        },
      },
      { status: 409 },
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Server-side context re-compile ───────────────────────────────────────────
  // Re-compile the vault context from the live DB using the validated queueHash
  // rather than relying on the context serialised into the job payload at enqueue
  // time. This guarantees the worker always generates against the current vault
  // state. Falls back to the job payload's context on any compilation error so
  // the pipeline degrades gracefully rather than failing hard.
  const jobStep = job.generation_payload.step;
  let freshCompiledContext: CompiledContext | undefined;
  try {
    freshCompiledContext = await compileContextForStep(admin, {
      workspaceId,
      appId,
      queueHash,
      vaultLocale,
      step: jobStep === "pipeline" ? "title" : jobStep,
    });
  } catch (recompileErr) {
    console.warn(
      JSON.stringify({
        event: "worker_context_recompile_failed",
        jobId: parsed.jobId,
        workspaceId,
        queueHash,
        error:
          recompileErr instanceof Error
            ? recompileErr.message
            : String(recompileErr),
        fallback: "using_job_payload_context",
      }),
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Redis lock heartbeat ────────────────────────────────────────────────────
  // Keeps the queue-hash lock alive for pipelines that exceed 1 minute so a
  // second producer cannot start a duplicate pipeline while this worker runs.
  const stopHeartbeat = startLockHeartbeat(workspaceId, queueHash);

  try {
    await runListingGenerationWorkerJob(parsed.jobId, { freshCompiledContext });
    return NextResponse.json({ ok: true, jobId: parsed.jobId });
  } catch (error) {
    // ── 423 Locked — phases not yet persisted ────────────────────────────────
    // The executor's DB-level phase guard detected that one or more prerequisite
    // phases (title / short / long) have not been written to workspace_listing_drafts
    // before the client attempted a 'full' or 'finalize' generation.  This is a
    // recoverable client-ordering error, not a server fault — return 423 so the
    // client can auto-chain the missing phases and retry.
    if (error instanceof ModularPhaseOrderError) {
      logPipelineEvent("WAITING_FOR_PHASES", {
        jobId: parsed.jobId,
        workspaceId,
        vaultLocale,
        queueHash,
        message: error.message,
        meta: { missingPhases: error.missingPhases },
      });

      await updateListingGenerationJob(parsed.jobId, {
        status: "failed",
        error: `Phases not persisted before full generation: ${error.missingPhases.join(", ")}. Complete individual phase steps first.`,
      });

      return NextResponse.json(
        {
          ok: false,
          jobId: parsed.jobId,
          error: {
            code: "phases_not_persisted",
            message: error.message,
            missingPhases: error.missingPhases,
          },
        },
        { status: 423 },
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const message = error instanceof Error ? error.message : "Worker failed";
    logPipelineEvent("worker_failed", {
      jobId: parsed.jobId,
      workspaceId,
      vaultLocale,
      queueHash,
      message,
    });

    // Mark the job as failed so the polling client sees a clear terminal state
    // immediately rather than waiting for the 8-minute staleness threshold to
    // expire before a new generate request can create a fresh job.
    await updateListingGenerationJob(parsed.jobId, {
      status: "failed",
      error: message,
    }).catch((dbErr) => {
      console.warn(
        JSON.stringify({
          event: "worker_failed_status_update_error",
          jobId: parsed.jobId,
          workspaceId,
          queueHash,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        }),
      );
    });

    return NextResponse.json(
      {
        ok: false,
        jobId: parsed.jobId,
        error: { code: "worker_failed", message },
      },
      { status: 500 },
    );
  } finally {
    stopHeartbeat();
  }
}
