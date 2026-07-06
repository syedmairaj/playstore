import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearListingGenerationJobState,
  LISTING_GENERATION_SUPERSEDED_ERROR,
  loadListingGenerationJob,
  supersedeActiveListingGenerationJobs,
  updateListingGenerationJob,
} from "@/lib/db/listing-generation-job";
import { upsertWorkspaceListingDraftRow } from "@/lib/db/workspace-listing-drafts";
import { patchListingGenerationCreditsLedger, patchListingGenerationPreviewOutput } from "@/lib/db/listing-generations";
import { modularStateToListingCopy } from "@/lib/listing/assemble-modular-listing";
import type { CompiledContext } from "@/lib/listing/context-gateway";
import {
  buildCreditLedgerMeta,
  consumeModularListingRegenerate,
  isModularPhaseBilledStep,
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logUsage } from "@/lib/usage-log";
import { releaseGenerationQueueHashLock } from "@/lib/listing/generation-queue-hash-lock";
import { fetchDraftState } from "@/lib/listing/listing-draft-persist";
import {
  runListingGenerationOrchestrator,
  MissingKeywordContextError,
  ModularPhaseOrderError,
  type OrchestratorModularResponse,
  type OrchestratorRunResult,
} from "@/lib/listing/listing-generation-orchestrator";
import type {
  ListingGenerationJobPayload,
  ListingGenerationJobResult,
  ListingGenerationPhase,
} from "@/lib/listing/listing-generation-job.types";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import { ListingGenerationUnavailableError } from "@/lib/listing/listing-generation-unavailable-error";
import { isModularLongBillingReady } from "@/lib/listing/modular-long-assembler";
import {
  shortDescriptionSchema,
} from "@/lib/listing/modular-listing.types";
import { getModularListingPromptVersion } from "@/lib/prompts/listing-modular";
import { orchestratorPromptVersion } from "@/lib/listing/listing-generation-orchestrator";
import { syncVisualAssetManifest } from "@/lib/listing/sync-visual-asset-manifest";
import type { GeneratedListingTextContent } from "@/lib/listing/asset-manifest.types";
import type {
  ModularListingState,
  ModularLongStepData,
} from "@/lib/listing/modular-listing.types";
import { createPipelineLogger } from "@/lib/listing/pipeline-logger";
import { writeToDlq } from "@/lib/db/listing-dlq";
import { populateListingVersionByJobId } from "@/lib/db/listing-versions";
import { fetchWorkspaceBrandKit } from "@/lib/db/fetch-workspace-brand-kit";
import { resolveSignalContext } from "@/lib/listing/resolve-signal-context";
import { saveVersionSignalSnapshot } from "@/lib/db/listing-version-signal-snapshots";

const WORKER_ROUTE = "POST /api/listings/worker";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function asExecuteResult(result: OrchestratorRunResult): OrchestratorModularResponse {
  if ("readOnly" in result && result.readOnly) {
    throw new ListingGenerationUnavailableError(
      "Listing generation worker received a read-only orchestrator result.",
    );
  }
  return result;
}

function phaseForStep(step: string): ListingGenerationPhase | null {
  if (step === "title" || step === "short" || step === "long" || step === "full") {
    return step;
  }
  if (step === "pipeline") return "title";
  if (step === "finalize" || step === "full") return "full";
  return null;
}

function buildJobResult(
  payload: ListingGenerationJobPayload,
  orchestratorResult: OrchestratorModularResponse,
  extras: {
    walletBalanceAfterDebit?: number;
    modularBillingMeta?: {
      creditsCharged: number;
      trialRegenerationsUsed: number;
      trialRegenerationsRemaining: number;
      creditsRemaining: number;
    } | null;
    qualityMeta?: Record<string, string>;
  },
): ListingGenerationJobResult {
  const step = orchestratorResult.step;
  const isPipeline = step === "pipeline";
  const isFullOrFinalize = step === "full" || step === "finalize";
  const promptVersion = payload.billsCredits
    ? orchestratorPromptVersion(payload.step)
    : getModularListingPromptVersion();

  const baseMeta: Record<string, unknown> = {
    model: payload.model,
    promptVersion,
    draftPersisted: orchestratorResult.draftPersisted,
    draftUpdatedAt: orchestratorResult.draftUpdatedAt,
    ...(extras.qualityMeta ?? {}),
  };

  if (isFullOrFinalize) {
    return {
      generationStep: step,
      data: orchestratorResult.data,
      ...(orchestratorResult.modularDraftLong != null
        ? { modularDraftLong: orchestratorResult.modularDraftLong }
        : {}),
      ...(orchestratorResult.modularDraftShort != null
        ? { modularDraftShort: orchestratorResult.modularDraftShort }
        : {}),
      warnings: orchestratorResult.warnings,
      meta: {
        ...baseMeta,
        persisted: orchestratorResult.persisted,
        generationId: orchestratorResult.generationId,
        savedAt: orchestratorResult.savedAt,
        asoScorePartial: orchestratorResult.asoScorePartial ? true : undefined,
        retried: orchestratorResult.retried ? true : undefined,
        shortDescriptionClamped: orchestratorResult.shortDescriptionClamped
          ? true
          : undefined,
        creditsCharged:
          extras.walletBalanceAfterDebit !== undefined ? payload.creditCost : 0,
        creditsRemaining: extras.walletBalanceAfterDebit,
      },
    };
  }

  return {
    generationStep: step,
    modularData: orchestratorResult.data,
    warnings: orchestratorResult.warnings,
    meta: {
      ...baseMeta,
      creditsCharged: isPipeline
        ? payload.creditCost
        : (extras.modularBillingMeta?.creditsCharged ?? 0),
      creditsRemaining: isPipeline
        ? extras.walletBalanceAfterDebit
        : extras.modularBillingMeta?.creditsRemaining,
      trialRegenerationsUsed: extras.modularBillingMeta?.trialRegenerationsUsed,
      trialRegenerationsRemaining: extras.modularBillingMeta?.trialRegenerationsRemaining,
    },
  };
}

/**
 * Extracts listing text fields from the orchestrator result for visual
 * archetype detection.  Handles all relevant step shapes (pipeline, full,
 * finalize, title, short, long).  Missing fields are returned as undefined.
 */
function extractListingTextContent(
  result: OrchestratorModularResponse,
): GeneratedListingTextContent {
  const { step, data } = result;

  if (step === "pipeline") {
    const s = data as ModularListingState;
    return {
      title: s.title?.value,
      shortDescription: s.shortDescription?.variations?.[s.shortDescription.selectedIndex]?.text,
      hook: s.longDescription?.hook,
      features: s.longDescription?.features,
      closing: s.longDescription?.closing,
    };
  }

  if (step === "full" || step === "finalize") {
    const d = data as Record<string, unknown>;
    return {
      title: typeof d.title === "string" ? d.title : undefined,
      shortDescription: typeof d.shortDescription === "string" ? d.shortDescription : undefined,
      features: typeof d.longDescription === "string" ? d.longDescription : undefined,
    };
  }

  if (step === "title") {
    const d = data as { title?: string };
    return { title: d.title };
  }

  if (step === "short") {
    const d = data as { variations?: Array<{ text?: string }> };
    return { shortDescription: d.variations?.[0]?.text };
  }

  if (step === "long" || step === "hook" || step === "features" || step === "closing") {
    const d = data as { hook?: string; features?: string; closing?: string };
    return { hook: d.hook, features: d.features, closing: d.closing };
  }

  return {};
}

/**
 * Populate the placeholder listing_version row (created by the produce route
 * before the 202) with the actual generated content once the worker finishes.
 * Best-effort: logs a warning on failure but never throws.
 */
function populateListingVersionFromResult(
  jobId: string,
  result: OrchestratorModularResponse,
  log: ReturnType<typeof createPipelineLogger>,
): void {
  const buildContent = () => {
    if (result.step === "pipeline") {
      const s = result.data as ModularListingState;
      const selectedVariation =
        s.shortDescription?.variations?.[s.shortDescription.selectedIndex]?.text ?? null;
      const long = s.longDescription as ModularLongStepData | undefined;
      const longText = [long?.hook, long?.features, long?.closing]
        .filter(Boolean)
        .join("\n\n");
      return {
        title: s.title?.value ?? null,
        shortDescription: selectedVariation,
        longDescription: longText || null,
        keywordSuggestions: [] as string[],
        ctaSuggestions: [] as string[],
      };
    }
    if (result.step === "full" || result.step === "finalize") {
      const d = result.data as Record<string, unknown>;
      return {
        title: typeof d.title === "string" ? d.title : null,
        shortDescription:
          typeof d.shortDescription === "string" ? d.shortDescription : null,
        longDescription:
          typeof d.fullDescription === "string" ? d.fullDescription : null,
        keywordSuggestions: Array.isArray(d.keywordSuggestions)
          ? (d.keywordSuggestions as string[])
          : [],
        ctaSuggestions: Array.isArray(d.ctaSuggestions)
          ? (d.ctaSuggestions as string[])
          : [],
      };
    }
    return null;
  };

  const content = buildContent();
  if (!content) return;

  populateListingVersionByJobId(jobId, content).catch((err) => {
    log.warn("listing_version_populate_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Validates that the persisted generation result contains non-empty content
 * for the fields that are expected for the given step.
 *
 * Returns `null` when the result is valid.
 * Returns a human-readable description of the malformation when something is
 * missing or empty — this string is forwarded to DLQ and logs.
 */
function detectMalformedResult(
  result: ListingGenerationJobResult | null,
  step: string,
): string | null {
  if (!result) return "generation_result is null — no data was persisted";

  const isPipeline = step === "pipeline";
  const isFullOrFinalize = step === "full" || step === "finalize";

  if (isPipeline) {
    const d = result.modularData as ModularListingState | null | undefined;
    if (!d) return "pipeline modularData is null";
    if (!d.title?.value?.trim()) return "pipeline title is empty";
    if (!d.shortDescription?.variations?.length) return "pipeline shortDescription has no variations";
    if (!d.longDescription?.hook?.trim()) return "pipeline longDescription hook is empty";
    return null;
  }

  if (isFullOrFinalize) {
    const d = result.data as Record<string, unknown> | null | undefined;
    if (!d) return "full/finalize data is null";
    if (typeof d.title !== "string" || !d.title.trim()) return "full/finalize title is empty";
    return null;
  }

  if (step === "title") {
    const d = result.modularData as { title?: string } | null | undefined;
    if (!d?.title?.trim()) return "title step produced empty title";
    return null;
  }

  if (step === "short") {
    const d = result.modularData as { variations?: Array<{ text?: string }> } | null | undefined;
    if (!d?.variations?.length) return "short step produced no variations";
    if (!d.variations[0]?.text?.trim()) return "short step first variation is empty";
    return null;
  }

  if (step === "long") {
    const d = result.modularData as { hook?: string } | null | undefined;
    if (!d?.hook?.trim()) return "long step produced empty hook";
    return null;
  }

  // Other step shapes (hook, features, closing, finalize sub-steps) are not
  // checked here — partial results are acceptable for granular sub-steps.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert-on-Arrival
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarantee a draft skeleton row exists for workspaceId + queueHash before any
 * generation step runs.
 *
 * Uses `ignoreDuplicates: true` so the call is a true no-op when a row already
 * exists — it never overwrites data written by a previous phase step.
 * Runs with the admin client to bypass RLS; always logs but never throws so a
 * transient DB hiccup at initialization cannot hard-fail the generation pipeline.
 *
 * Impacts EN + AR environments.
 */
async function ensureDraftRowExists(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    appId?: string | null;
    queueHash: string;
    vaultLocale: "en" | "ar";
  },
): Promise<void> {
  const upsert = await upsertWorkspaceListingDraftRow(
    supabase,
    {
      workspace_id: params.workspaceId,
      user_id: params.userId,
      app_id: params.appId ?? null,
      vault_locale: params.vaultLocale,
      queue_hash: params.queueHash,
      persisted_phases: { title: false, short: false, long: false },
    },
    { ignoreDuplicates: true },
  );

  if (!upsert.ok) {
    console.warn(
      JSON.stringify({
        event: "draft_row_initialization_failed",
        correlationId: params.queueHash,
        workspaceId: params.workspaceId,
        vaultLocale: params.vaultLocale,
        errorMessage: upsert.message,
      }),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase pre-flight guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured result returned by `assertFullStepPhasesPersisted`.
 *
 * Using a discriminated union instead of throw-on-failure means callers can
 * explicitly update job state BEFORE re-throwing the error, ensuring polling
 * clients always see a clear terminal state rather than a stuck 'processing' row.
 */
type PhaseCheckResult =
  | { ok: true }
  | { ok: false; missingPhases: Array<"title" | "short" | "long"> };

/**
 * DB-level pre-flight guard for the 'full' / 'finalize' generation step.
 *
 * Reads `persisted_phases` directly from `workspace_listing_drafts` rather than
 * trusting the in-memory orchestrator state.  Returns `{ ok: false, missingPhases }`
 * if any phase is missing so callers can update the job status before throwing.
 */
async function assertFullStepPhasesPersisted(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    appId?: string | null;
    queueHash: string;
    vaultLocale: "en" | "ar";
  },
): Promise<PhaseCheckResult> {
  const draft = await fetchDraftState(supabase, {
    workspaceId: params.workspaceId,
    queueHash: params.queueHash,
    userId: params.userId,
    appId: params.appId,
    vaultLocale: params.vaultLocale,
  });

  const { title, short, long } = draft.persistedPhases;
  const missingPhases: Array<"title" | "short" | "long"> = [];
  if (!title) missingPhases.push("title");
  if (!short) missingPhases.push("short");
  if (!long) missingPhases.push("long");

  if (missingPhases.length > 0) {
    return { ok: false, missingPhases };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type RunListingGenerationWorkerOptions = {
  /**
   * Context freshly compiled by the worker route after vault-hash validation.
   * When provided this overrides the gateway context serialised into the job
   * payload at enqueue time, ensuring the worker always runs against the live
   * vault state rather than a potentially stale snapshot.
   */
  freshCompiledContext?: CompiledContext;
};

/**
 * QStash consumer — runs the listing orchestrator for a queued job.
 *
 * All log entries carry `correlationId` (= queueHash) so the entire execution
 * trace for one generation run is retrievable from a log aggregator with:
 *   { correlationId: "<queueHash>" }
 *
 * @param freshCompiledContext - When supplied by the worker route (re-compiled
 *   after vault-hash validation) this replaces the serialised gateway context
 *   stored in the job payload, so generation always uses the current vault state.
 */
export async function runListingGenerationWorkerJob(
  jobId: string,
  options?: RunListingGenerationWorkerOptions,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const job = await loadListingGenerationJob(jobId);

  if (!job?.generation_payload) {
    throw new Error(`Listing generation job not found: ${jobId}`);
  }

  if (job.generation_status === "completed") {
    console.log(JSON.stringify({ event: "worker_job_idempotent_skip", jobId }));
    return;
  }

  if (
    job.generation_status === "failed" &&
    typeof job.generation_error === "string" &&
    job.generation_error.includes(LISTING_GENERATION_SUPERSEDED_ERROR)
  ) {
    console.log(JSON.stringify({ event: "worker_job_superseded_skip", jobId }));
    return;
  }

  const payload = job.generation_payload;
  const { workspaceId, userId, clientIp, step } = payload;
  // queueHash is declared at function scope so the finally block can release
  // the Redis lock even when execution fails inside the try block.
  const queueHash = payload.body.queueHash;
  const vaultLocale = (payload.body.vaultLocale ?? "en") as "en" | "ar";
  const startTime = Date.now();

  // ── Structured logger — correlationId baked into every entry ───────────────
  const log = createPipelineLogger({ correlationId: queueHash, jobId, workspaceId });

  // ── Transition: Initialization ────────────────────────────────────────────
  log.info("worker_job_init", { step, vaultLocale, model: payload.model });

  const compiledContext =
    options?.freshCompiledContext ?? payload.gatewayCompiledContext;

  await updateListingGenerationJob(jobId, {
    status: "processing",
    currentPhase: phaseForStep(step),
    error: null,
  });

  const workerDraftSeedParams = {
    workspaceId,
    userId,
    appId: payload.body.appId ?? null,
    queueHash,
    vaultLocale,
  };

  log.info("worker_draft_seed_start");
  await ensureDraftRowExists(admin, workerDraftSeedParams);
  log.info("worker_draft_seed_done");

  // ── Transition: Phase Check ───────────────────────────────────────────────
  // Guard the full / finalize step — verify all prerequisite phases are in DB.
  // Pre-mark the job as failed before re-throwing so polling sees a clear
  // terminal state immediately, not a stuck 'processing' row.
  // Finalize assembles persisted modular phases; `full` generates everything atomically.
  if (step === "finalize") {
    log.info("worker_phase_check_start", { step });
    const phaseCheck = await assertFullStepPhasesPersisted(admin, workerDraftSeedParams);
    if (!phaseCheck.ok) {
      await updateListingGenerationJob(jobId, {
        status: "failed",
        error: `Prerequisite phases not persisted: [${phaseCheck.missingPhases.join(", ")}]. Complete title, short, and long phases before generating '${step}'.`,
      });
      log.error("worker_phase_check_failed", { step, missingPhases: phaseCheck.missingPhases });
      throw new ModularPhaseOrderError(phaseCheck.missingPhases, "WAITING_FOR_PHASES");
    }
    log.info("worker_phase_check_passed", { step });
  }

  let ledgerId: string | null = null;

  // ── Transition: Generation Start ─────────────────────────────────────────
  log.info("worker_generation_start", { step, billsCredits: payload.billsCredits });

  try {
    // ── Signal Context: fetch workspace intelligence for prompt enrichment ──────
    // Best-effort, non-blocking — brand kit fetch failure does not abort generation.
    const brandKit = await fetchWorkspaceBrandKit(admin, workspaceId, payload.body.appId ?? null);
    const signalContext = resolveSignalContext(payload.listingInputForGeneration, brandKit);
    log.info("worker_signal_context_resolved", {
      hasBrandKit: !!(brandKit.style || brandKit.primaryColor),
      marketGaps: signalContext.marketIntel.gaps.length,
      reviewPains: signalContext.reviews.topPainPoints.length,
      competitors: signalContext.competitorSignals.weaknesses.length,
      keywordsHigh: signalContext.keywordTracker.highConfidenceKeywords.length,
    });

    // ── Performance Attribution: persist signal snapshot (fire-and-forget) ─────
    // Runs in background — snapshot write failure must not block generation.
    saveVersionSignalSnapshot({
      jobId,
      workspaceId,
      vaultLocale,
      brandKit: signalContext.brandKit,
      marketIntel: signalContext.marketIntel,
      reviews: signalContext.reviews,
      keywordTracker: signalContext.keywordTracker,
      competitorSignals: signalContext.competitorSignals,
    }).catch((err) =>
      log.error("worker_signal_snapshot_save_failed", { error: String(err) }),
    );

    // ── Observability: LLM call latency measurement ───────────────────────────
    // Records wall-clock time for the entire orchestrator invocation (including
    // all Gemini API calls and any internal retries).  Emitted as a structured
    // event immediately after the call completes so it is visible in log
    // aggregators regardless of whether billing or persistence succeeds.
    const llmStart = Date.now();

    const orchestratorResult = await runListingGenerationOrchestrator({
      executionMode: "execute",
      step,
      body: {
        ...payload.body,
        ...payload.listingInputForGeneration,
      },
      supabase: admin,
      workspaceId,
      userId,
      appId: payload.body.appId,
      clientIp,
      model: payload.model,
      creditsLedgerId: null,
      preflightWarnings: payload.preflightWarnings,
      headerWorkspaceId: payload.headerWorkspaceId,
      isDraft: false,
      pipeline: payload.pipeline,
      contextPackage: payload.contextPackage,
      compiledContext,
      signalContext,
      workerStartedAt: startTime,
      onPipelinePhaseStart: async (phase) => {
        log.info("worker_pipeline_phase_start", { phase });
        await updateListingGenerationJob(jobId, { currentPhase: phase });
      },
    });

    // ── Observability: LLM latency event ─────────────────────────────────────
    const llmDurationMs = Date.now() - llmStart;
    log.info("worker_generation_latency", {
      step,
      durationMs: llmDurationMs,
      model: payload.model,
    });

    const modularResult = asExecuteResult(orchestratorResult);
    const isPipeline = modularResult.step === "pipeline";
    const isFullOrFinalize =
      modularResult.step === "full" || modularResult.step === "finalize";

    let walletBalanceAfterDebit: number | undefined;
    let modularBillingMeta: {
      creditsCharged: number;
      trialRegenerationsUsed: number;
      trialRegenerationsRemaining: number;
      creditsRemaining: number;
    } | null = null;

    if (payload.billsCredits) {
      const debit = await consumeWorkspaceAiCredits(admin, {
        workspaceId,
        userId,
        amount: payload.creditCost,
        description:
          step === "pipeline"
            ? "Listing AI pipeline (modular)"
            : step === "finalize"
              ? "Listing AI finalize (modular pipeline)"
              : "Listing AI generation (Gemini)",
        sourceType: "generation",
        meta: buildCreditLedgerMeta("text", {
          route: WORKER_ROUTE,
          tool: "aso_listing",
          model: payload.model,
          generationStep: step,
          jobId,
          billing_kind:
            step === "pipeline"
              ? "modular_pipeline"
              : step === "finalize"
                ? "modular_finalize"
                : "full_listing",
        }),
      });

      if (!debit.ok) {
        throw new ListingGenerationUnavailableError(
          debit.code === "insufficient_credits"
            ? "Insufficient credits to complete listing generation."
            : "Credits could not be applied after generation.",
        );
      }

      ledgerId = debit.ledgerId;
      walletBalanceAfterDebit = debit.balanceAfter;

      if (ledgerId && isFullOrFinalize && payload.body.appId) {
        await patchListingGenerationCreditsLedger(admin, {
          workspaceId,
          userId,
          appId: payload.body.appId,
          creditsLedgerId: ledgerId,
        });
      }
    }

    if (payload.billsModularPhase) {
      const shortBillingReady =
        step !== "short" ||
        (modularResult.step === "short" &&
          shortDescriptionSchema.safeParse(modularResult.data).success);

      const longBillingReady =
        step !== "long" ||
        (modularResult.step === "long" &&
          isModularLongBillingReady(modularResult.data));

      if (shortBillingReady && longBillingReady) {
        const regenDebit = await consumeModularListingRegenerate(admin, {
          workspaceId,
          userId,
          generationStep: step,
          meta: buildCreditLedgerMeta("text", {
            route: WORKER_ROUTE,
            model: payload.model,
            tool: "modular_listing_regenerate",
            jobId,
            billing_kind: isModularPhaseBilledStep(step)
              ? "modular_phase"
              : "modular_regenerate",
          }),
        });

        if (regenDebit.ok) {
          ledgerId = regenDebit.ledgerId;
          modularBillingMeta = {
            creditsCharged: regenDebit.creditsCharged,
            trialRegenerationsUsed: regenDebit.trialRegenerationsUsed,
            trialRegenerationsRemaining: regenDebit.trialRegenerationsRemaining,
            creditsRemaining: regenDebit.balanceAfter,
          };
        }
      }
    }

    const result = buildJobResult(payload, modularResult, {
      walletBalanceAfterDebit,
      modularBillingMeta,
      qualityMeta: payload.qualityMeta,
    });

    // ── Transition: Write to DB ───────────────────────────────────────────────
    log.info("worker_job_completing", { step, generationStep: modularResult.step });

    await updateListingGenerationJob(jobId, {
      status: "completed",
      currentPhase: isFullOrFinalize ? "full" : isPipeline ? "long" : phaseForStep(modularResult.step),
      result,
      error: null,
    });

    // ── SELECT verification + DLQ guard ──────────────────────────────────────
    // updateListingGenerationJob() swallows DB errors with console.warn.
    // An explicit read-back confirms the write succeeded AND that the
    // generated content fields are non-empty.  Any failure routes to DLQ so
    // the payload is preserved for manual replay.
    {
      const { data: verifiedRow } = await admin
        .from("workspace_listing_drafts")
        .select("job_id, generation_status, generation_result")
        .eq("job_id", jobId)
        .maybeSingle();

      const persistedStatus = verifiedRow?.generation_status ?? null;
      const persistedResult = verifiedRow?.generation_result as ListingGenerationJobResult | null;

      if (persistedStatus !== "completed") {
        // ── DLQ: write_unverified ─────────────────────────────────────────────
        const reason = `Completion UPDATE could not be confirmed — row shows status '${persistedStatus ?? "null (row missing)"}' after write`;
        log.error("worker_completion_write_unverified", {
          expectedStatus: "completed",
          actualStatus: persistedStatus ?? "null (row missing)",
        });
        await writeToDlq({
          jobId,
          workspaceId,
          queueHash,
          vaultLocale,
          step,
          failureEvent: "write_unverified",
          failureReason: reason,
          generationPayload: payload,
          generationResult: result,
        });
      } else {
        // ── Safety check: detect malformed / empty generated content ──────────
        const malformReason = detectMalformedResult(persistedResult, step);
        if (malformReason) {
          log.error("worker_malformed_generation", { step, reason: malformReason });
          await writeToDlq({
            jobId,
            workspaceId,
            queueHash,
            vaultLocale,
            step,
            failureEvent: "malformed_generation",
            failureReason: `Malformed generation output: ${malformReason}`,
            generationPayload: payload,
            generationResult: persistedResult,
          });
        } else {
          log.info("worker_job_completed", {
            step,
            durationMs: Date.now() - startTime,
          });
        }
      }
    }

    // ── Visual asset manifest sync (best-effort) ──────────────────────────────
    if (
      isPipeline &&
      modularResult.step === "pipeline" &&
      payload.body.appId &&
      modularResult.data
    ) {
      const copy = modularStateToListingCopy(
        modularResult.data as ModularListingState,
      );
      if (copy.title.trim()) {
        await patchListingGenerationPreviewOutput(admin, {
          workspaceId,
          userId,
          appId: payload.body.appId,
          output: {
            title: copy.title,
            shortDescription: copy.shortDescription,
            fullDescription: copy.fullDescription,
            keywordSuggestions: [],
            ctaSuggestions: [],
          },
        });
      }
    }

    if (isPipeline || isFullOrFinalize) {
      const generatedText = extractListingTextContent(modularResult);
      syncVisualAssetManifest(admin, {
        workspaceId,
        appId: payload.body.appId ?? null,
        vaultLocale,
        queueHash,
        jobId,
        generatedText,
      }).catch((err) => {
        log.warn("sync_visual_asset_manifest_background_error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // ── ListingVersion back-fill (best-effort) ────────────────────────────────
    // The produce route created a placeholder listing_version row with
    // source_job_id = jobId before returning 202.  Populate it now with the
    // generated content so the client's DeploymentView can display the result.
    if (isPipeline || isFullOrFinalize) {
      populateListingVersionFromResult(jobId, modularResult, log);
    }

    await logUsage(admin, {
      route: WORKER_ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - startTime,
      meta: {
        user_id: userId,
        workspace_id: workspaceId,
        generation_step: step,
        job_id: jobId,
        credits_billed: payload.billsCredits,
        persisted: isFullOrFinalize ? modularResult.persisted : false,
      },
    });
  } catch (error) {
    if (ledgerId) {
      await refundWorkspaceAiCredits(admin, {
        ledgerId,
        userId,
        reason: "Listing AI generation failed in async worker",
      });
    }

    const message =
      error instanceof Error ? error.message : "Listing generation failed unexpectedly";

    await updateListingGenerationJob(jobId, {
      status: "failed",
      error: message.slice(0, 2000),
    });

    await logUsage(admin, {
      route: WORKER_ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: message.slice(0, 2000),
      meta: {
        user_id: userId,
        workspace_id: workspaceId,
        generation_step: step,
        job_id: jobId,
        error_code:
          error instanceof ModularPhaseOrderError
            ? error.code
            : error instanceof MissingKeywordContextError
              ? error.code
              : error instanceof InvalidModelOutputError
                ? "invalid_model_output"
                : "worker_error",
      },
    });

    throw error;
  } finally {
    await releaseGenerationQueueHashLock(workspaceId, queueHash);
  }
}

export async function executeListingGenerationSync(params: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  payload: ListingGenerationJobPayload;
  startTime: number;
  clientIp: string;
}): Promise<ListingGenerationJobResult> {
  const { payload, admin, startTime, clientIp } = params;
  const { workspaceId, userId, step } = payload;
  const queueHash = payload.body.queueHash;
  const vaultLocale = (payload.body.vaultLocale ?? "en") as "en" | "ar";

  // ── Structured logger — correlationId baked into every entry ───────────────
  const log = createPipelineLogger({ correlationId: queueHash, workspaceId });

  const draftSeedParams = {
    workspaceId,
    userId,
    appId: payload.body.appId ?? null,
    queueHash,
    vaultLocale,
  };

  // ── Transition: Initialization ────────────────────────────────────────────
  log.info("sync_generation_init", { step, vaultLocale });

  await supersedeActiveListingGenerationJobs(workspaceId, queueHash);

  await ensureDraftRowExists(admin, draftSeedParams);

  // ── Transition: Generation Start ─────────────────────────────────────────
  // NOTE: no assertFullStepPhasesPersisted check here.
  //
  // This function (executeListingGenerationSync) is called exclusively for
  // the instant-draft / fast-draft path (isDraft:true).  That flow generates
  // title, short, and long in a single Gemini call — there are no sequential
  // phase dependencies to enforce and persisted_phases is never written by
  // this path.
  //
  // The modular-phase ordering guard (assertFullStepPhasesPersisted) belongs
  // only in runListingGenerationWorkerJob, which drives the async modular
  // pipeline (title → short → long → full as separate worker jobs).
  // Placing the guard here permanently blocked every classic "full" draft
  // because persisted_phases.{title,short,long} are always false until the
  // async worker writes them.
  log.info("sync_generation_start", { step, model: payload.model });

  // Best-effort signal context fetch for prompt enrichment.
  const syncBrandKit = await fetchWorkspaceBrandKit(
    params.supabase,
    workspaceId,
    payload.body.appId ?? null,
  );
  const syncSignalContext = resolveSignalContext(payload.listingInputForGeneration, syncBrandKit);

  // Performance Attribution: persist signal snapshot for sync (draft) runs.
  // Uses a synthetic jobId built from the queue hash to stay idempotent.
  const syncJobId = `sync_${payload.body.queueHash}_${Date.now()}`;
  saveVersionSignalSnapshot({
    jobId: syncJobId,
    workspaceId,
    vaultLocale: (payload.body.vaultLocale ?? "en") as "en" | "ar",
    brandKit: syncSignalContext.brandKit,
    marketIntel: syncSignalContext.marketIntel,
    reviews: syncSignalContext.reviews,
    keywordTracker: syncSignalContext.keywordTracker,
    competitorSignals: syncSignalContext.competitorSignals,
  }).catch(() => {});

  const llmStart = Date.now();

  let walletBalanceAfterDebit: number | undefined;
  let creditsLedgerId: string | null = null;

  if (payload.billsCredits) {
    // Wallet RPCs require auth.uid() = p_user_id — use the signed-in user client,
    // not the service-role admin client (auth.uid() is null there → unauthorized).
    let debit;
    try {
      debit = await consumeWorkspaceAiCredits(params.supabase, {
        workspaceId,
        userId,
        amount: payload.creditCost,
        description:
          step === "full"
            ? "Listing AI generation (full unlock)"
            : "Listing AI draft generation",
        sourceType: "generation",
        meta: buildCreditLedgerMeta("text", {
          route: "POST /api/listings/generate",
          tool: "aso_listing",
          model: payload.model,
          generationStep: step,
          billing_kind: step === "full" ? "full_listing" : "draft",
        }),
      });
    } catch (debitError) {
      throw new ListingGenerationUnavailableError(
        debitError instanceof Error
          ? debitError.message
          : "Credits could not be applied before generation.",
      );
    }

    if (!debit.ok) {
      console.log(
        JSON.stringify({
          event: "sync_credit_debit_failed",
          correlationId: queueHash,
          workspaceId,
          step,
          code: debit.code,
          remaining: debit.remaining,
          required: debit.required,
        }),
      );
      throw new ListingGenerationUnavailableError(
        debit.code === "insufficient_credits"
          ? "Insufficient credits to complete listing generation."
          : debit.code === "unauthorized"
            ? "Could not authorize credit debit for this session. Sign out and back in, then retry."
            : "Credits could not be applied before generation.",
      );
    }

    walletBalanceAfterDebit = debit.balanceAfter;
    creditsLedgerId = debit.ledgerId ?? null;
    log.info("sync_credit_debit_ok", {
      step,
      creditsCharged: payload.creditCost,
      balanceAfter: walletBalanceAfterDebit,
    });
  }

  log.info("sync_generation_orchestrator_enter", { step, billsCredits: payload.billsCredits });

  let orchestratorResult: OrchestratorRunResult;
  try {
    orchestratorResult = await runListingGenerationOrchestrator({
      executionMode: "execute",
      step,
      body: {
        ...payload.body,
        ...payload.listingInputForGeneration,
      },
      supabase: params.supabase,
      workspaceId,
      userId,
      appId: payload.body.appId,
      clientIp,
      model: payload.model,
      creditsLedgerId,
      preflightWarnings: payload.preflightWarnings,
      headerWorkspaceId: payload.headerWorkspaceId,
      isDraft: !payload.billsCredits,
      pipeline: payload.pipeline,
      contextPackage: payload.contextPackage,
      compiledContext: payload.gatewayCompiledContext,
      signalContext: syncSignalContext,
      skipSupersededPersistGuard:
        payload.billsCredits && (step === "full" || step === "finalize"),
    });
  } catch (generationError) {
    console.log(
      JSON.stringify({
        event: "sync_generation_orchestrator_failed",
        correlationId: queueHash,
        workspaceId,
        step,
        message:
          generationError instanceof Error
            ? generationError.message
            : String(generationError),
        errorName:
          generationError instanceof Error ? generationError.name : undefined,
        stack:
          generationError instanceof Error ? generationError.stack : undefined,
      }),
    );
    if (creditsLedgerId) {
      await refundWorkspaceAiCredits(params.supabase, {
        ledgerId: creditsLedgerId,
        userId,
        reason: "sync_generation_failed",
      }).catch(() => {});
    }
    throw generationError;
  }

  log.info("worker_generation_latency", {
    step,
    durationMs: Date.now() - llmStart,
    model: payload.model,
    path: "sync",
  });

  const modularResult = asExecuteResult(orchestratorResult);

  let modularBillingMeta: {
    creditsCharged: number;
    trialRegenerationsUsed: number;
    trialRegenerationsRemaining: number;
    creditsRemaining: number;
  } | null = null;

  if (payload.billsModularPhase) {
    const shortBillingReady =
      step !== "short" ||
      (modularResult.step === "short" &&
        shortDescriptionSchema.safeParse(modularResult.data).success);

    const longBillingReady =
      step !== "long" ||
      (modularResult.step === "long" &&
        isModularLongBillingReady(modularResult.data));

    if (shortBillingReady && longBillingReady) {
      try {
        const regenDebit = await consumeModularListingRegenerate(params.supabase, {
          workspaceId,
          userId,
          generationStep: step,
          meta: buildCreditLedgerMeta("text", {
            route: "POST /api/listings/generate",
            model: payload.model,
            tool: "modular_listing_regenerate",
            billing_kind: isModularPhaseBilledStep(step)
              ? "modular_phase"
              : "modular_regenerate",
          }),
        });

        if (regenDebit.ok) {
          modularBillingMeta = {
            creditsCharged: regenDebit.creditsCharged,
            trialRegenerationsUsed: regenDebit.trialRegenerationsUsed,
            trialRegenerationsRemaining: regenDebit.trialRegenerationsRemaining,
            creditsRemaining: regenDebit.balanceAfter,
          };
        }
      } catch (regenBillingError) {
        console.log(
          JSON.stringify({
            event: "sync_modular_regenerate_billing_failed",
            workspaceId,
            step,
            message:
              regenBillingError instanceof Error
                ? regenBillingError.message
                : String(regenBillingError),
          }),
        );
      }
    }
  }

  await logUsage(admin, {
    route: "POST /api/listings/generate",
    clientIp,
    success: true,
    durationMs: Date.now() - startTime,
    meta: {
      user_id: userId,
      workspace_id: workspaceId,
      generation_step: step,
      is_draft: true,
    },
  });

  await clearListingGenerationJobState(workspaceId, queueHash);

  return buildJobResult(payload, modularResult, {
    walletBalanceAfterDebit,
    modularBillingMeta,
    qualityMeta: payload.qualityMeta,
  });
}
