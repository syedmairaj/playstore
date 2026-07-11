import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import {
  patchListingGenerationInputs,
} from "@/lib/db/listing-generations";
import {
  isCreditBilledStep,
  listingModularGenerateBodySchema,
  formatFirstZodIssueMessage,
} from "@/lib/validation/listing-modular-generate-body";
import {
  ModularPipelineEntryError,
  ModularPhaseOrderError,
  MissingKeywordContextError,
  runListingGenerationOrchestrator,
} from "@/lib/listing/listing-generation-orchestrator";
import { resolveGeminiModel } from "@/lib/gemini/gemini-defaults";
import {
  logGeminiApiKeyDiagnostics,
  shouldLogGeminiDebug,
} from "@/lib/gemini/log-gemini-env";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  billsModularListingPhase,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features";
import { ListingGenerationUnavailableError } from "@/lib/listing/listing-generation-unavailable-error";
import { ensureModularListingDraftPersisted } from "@/lib/listing/listing-draft-persist";
import { MODULAR_TRIAL_REGENERATIONS_LIMIT } from "@/lib/features/billing/modular-regenerate-billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/supabase/route-auth";
import { logUsage } from "@/lib/usage-log";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  acquireGenerationLock,
  releaseGenerationLock,
} from "@/lib/server/generation-idempotency-lock";
import {
  buildContextAuditSnapshot,
  logActiveContextAudit,
} from "@/lib/optimization-queue/context-audit-log";
import { shouldPreferAsyncFullUnlock } from "@/lib/listing/full-unlock-async-policy";
import { validateActiveContextQueueHash } from "@/lib/optimization-queue/validate-active-context-queue-hash";
import { assessListingInputWarnings } from "@/lib/listing/listing-generation-heuristics";
import { dedupeWarnings } from "@/lib/listing/listing-generation-warnings";
import {
  resolvePrecomputedGenerationContext,
  ContextPackageUnavailableError,
} from "@/lib/listing/resolve-generation-context";
import { useOptimizedPipeline } from "@/lib/listing/listing-generation-adapter";
import { fetchOptimizedContext } from "@/lib/optimizer/fetch-optimized-context";
import {
  assertWorkspaceHandshake,
  WorkspaceHandshakeError,
} from "@/lib/workspace/workspace-handshake";
import {
  hasPreGenerationKeywordContext,
  logTrackedKeywordSignalsPreflight,
} from "@/lib/listing/listing-pre-generation-guard";
import { activeContextHasSignals } from "@/lib/optimization-queue/build-active-context-synthesis";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  enrichListingInputWithRequestKeywords,
  resolveEffectiveVaultItemCount,
} from "@/lib/listing/merge-request-keyword-signals";
import {
  stampAndCompileListingContext,
  ContextGatewayError,
  KeywordContextRequiredError,
  KEYWORD_CONTEXT_REQUIRED_MESSAGE,
  applyCompiledContextToListingInput,
  type CompiledContext,
} from "@/lib/listing/context-gateway";
import { assertModularPipelineEntry } from "@/lib/listing/modular-pipeline-state-machine";
import {
  checkIntelModulesReady,
  type VisualAlignmentWarning,
} from "@/lib/listing/check-intel-modules-processing";
import {
  acquireGenerationQueueHashLock,
  releaseGenerationQueueHashLock,
} from "@/lib/listing/generation-queue-hash-lock";
import { assertListingRequestSerializable, ListingContextSerializationError } from "@/lib/listing/listing-context-serialization-error";
import {
  clearListingGenerationJobState,
  createListingGenerationJob,
  findActiveJobByQueueHash,
} from "@/lib/db/listing-generation-job";
import type { ListingGenerationJobPayload } from "@/lib/listing/listing-generation-job.types";
import { LISTING_GENERATION_JOB_PAYLOAD_VERSION } from "@/lib/listing/listing-generation-job.types";
import { executeListingGenerationSync } from "@/lib/listing/listing-generation-executor";
import { publishListingGenerationWorker, republishListingGenerationWorker } from "@/lib/qstash/publish-listing-generation";
import { createListingVersion } from "@/lib/db/listing-versions";
import { clampPlayStoreTitle } from "@/lib/listing/clamp-play-store-title";

/** Producer route — sync full unlock + instant draft may run Gemini inline. */
export const maxDuration = 300;

const ROUTE = "POST /api/listings/generate";

/** Run in-request — QStash async jobs often stay `pending` on localhost. */
const SYNC_LISTING_STEPS = new Set([
  "full",
  "title",
  "short",
  "long",
  "hook",
  "features",
  "closing",
]);
const LOCK_ACTION = "listing_generate";

function waitingForPhasesResponse(
  workspaceId: string,
  queueHash: string,
  jobId?: string,
  missingPhases?: Array<"title" | "short" | "long">,
) {
  return NextResponse.json(
    {
      status: "pending",
      message: "Pipeline phases are still processing",
      code: "WAITING_FOR_PHASES",
      ...(jobId ? { jobId, accepted: true, ok: true } : {}),
      workspaceId,
      queueHash,
      ...(missingPhases?.length ? { missingPhases } : {}),
    },
    { status: 202 },
  );
}

function rateLimitMax(): number {
  const raw = process.env.RATE_LIMIT_MAX;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export async function POST(request: NextRequest) {
  console.log("--- [DEBUG] Pipeline Entry Point: POST /api/listings/generate ---");
  logGeminiApiKeyDiagnostics();
  const startTime = Date.now();
  const clientIp = getClientIp(request);

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error";
    return NextResponse.json(
      { ok: false, error: { code: "config", message } },
      { status: 503 },
    );
  }

  const { supabase, user } = await resolveAuthenticatedUser(request);
  console.log("[DEBUG] Route: resolveAuthenticatedUser() resolved", {
    hasUser: Boolean(user),
  });

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Sign in required. Open the listing optimizer from a workspace.",
        },
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "bad_request", message: "Invalid JSON body" },
      },
      { status: 400 },
    );
  }

  console.log("[listing-generate] Incoming Payload:", JSON.stringify(body, null, 2));

  let input: z.infer<typeof listingModularGenerateBodySchema>;
  try {
    input = listingModularGenerateBodySchema.parse(body);
    if (shouldLogGeminiDebug() || process.env.NODE_ENV !== "production") {
      console.log("[listing-generate] Parsed payload summary:", {
        generationStep: input.generationStep,
        lockedKeywords: input.lockedKeywords,
        hasOrchestration: Boolean(input.orchestration),
        hasModularListing: Boolean(input.modularListing),
        contextTitle: input.contextTitle,
      });
    }
  } catch (e) {
    if (e instanceof ZodError) {
      if (shouldLogGeminiDebug()) {
        console.error("[listing-generate] validation_error", e.flatten());
      }
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation_error",
            message: formatFirstZodIssueMessage(e),
            details: e.flatten(),
          },
        },
        { status: 400 },
      );
    }
    throw e;
  }

  const {
    workspaceId,
    appId: bodyAppId,
    activeSignalTypes,
    vaultLocale,
    queueHash,
    clientQueueItemCount,
    generationStep,
    isRegenerate,
    includeOptimizerContext,
    isDraft,
    fastDraft,
    ...listingInput
  } = input;

  const step = generationStep ?? "full";
  const headerWorkspaceId = request.headers.get("x-workspace-id");
  const instantDraft = isDraft === true;
  const fastDraftRequest = fastDraft === true;

  try {
    assertModularPipelineEntry({
      step,
      isRegenerate: isRegenerate ?? false,
      isDraft: instantDraft,
      fastDraft: fastDraftRequest,
    });
  } catch (e) {
    if (e instanceof ModularPipelineEntryError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: e.code,
            message: e.message,
          },
        },
        { status: 409 },
      );
    }
    throw e;
  }

  const effectiveIncludeOptimizerContext =
    !instantDraft && !fastDraftRequest && includeOptimizerContext === true;

  try {
    assertListingRequestSerializable(input, "listing_modular_generate_body");
  } catch (e) {
    if (e instanceof ListingContextSerializationError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: e.code,
            message: e.message,
          },
        },
        { status: 422 },
      );
    }
    throw e;
  }

  function computeIsSignalEnhanced(
    gated: ListingOptimizerInput & {
      activeContext?: ListingOptimizerInput["activeContext"];
    },
  ): boolean {
    if (instantDraft || fastDraftRequest || !effectiveIncludeOptimizerContext) {
      return false;
    }
    if (
      hasPreGenerationKeywordContext({
        trackedKeywordSignals: gated.trackedKeywordSignals,
        includeOptimizerContext: true,
      })
    ) {
      return true;
    }
    return Boolean(gated.activeContext && activeContextHasSignals(gated.activeContext));
  }

  try {
    await assertWorkspaceHandshake({
      supabase,
      workspaceId,
      userId: user.id,
      headerWorkspaceId,
    });
  } catch (e) {
    if (e instanceof WorkspaceHandshakeError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: e.code,
            message: e.message,
            refreshWorkspace: e.refreshWorkspace,
            details: e.details,
          },
        },
        { status: 409 },
      );
    }
    throw e;
  }

  let gatewayCompiledContext: CompiledContext | undefined;

  if (!instantDraft && !fastDraftRequest) {
    try {
      const gatewayDbStart = Date.now();
      console.log("[DEBUG] DB: initiating stampAndCompileListingContext", {
        workspaceId,
        appId: bodyAppId ?? null,
        queueHash,
        vaultLocale,
        step,
      });
      gatewayCompiledContext = await stampAndCompileListingContext(supabase, {
        workspaceId,
        appId: bodyAppId,
        queueHash,
        vaultLocale,
        step: step === "pipeline" ? "title" : step,
      });
      console.log("[DEBUG] DB: stampAndCompileListingContext completed", {
        elapsedMs: Date.now() - gatewayDbStart,
        signalCount: gatewayCompiledContext.signals.length,
        keywordCount: gatewayCompiledContext.keywords.length,
      });
    } catch (e) {
      if (e instanceof KeywordContextRequiredError) {
        return NextResponse.json(
          {
            error: "KEYWORD_CONTEXT_REQUIRED",
            message: KEYWORD_CONTEXT_REQUIRED_MESSAGE,
          },
          { status: 400 },
        );
      }
      if (e instanceof ContextGatewayError) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: e.code,
              message: e.message,
            },
          },
          { status: 503 },
        );
      }
      throw e;
    }
  }

  const queueHashValidation = instantDraft || fastDraftRequest
    ? {
        ok: true as const,
        clientQueueHash: queueHash,
        serverQueueHash: queueHash,
        itemCount: 0,
        signalBreakdown: {
          keywordCount: 0,
          competitorCount: 0,
          reviewCount: 0,
          marketCount: 0,
        },
        hashFullyPopulated: false,
      }
    : await validateActiveContextQueueHash(supabase, {
        workspaceId,
        locale: vaultLocale,
        appId: bodyAppId,
        clientQueueHash: queueHash,
        clientQueueItemCount,
      });

  if (!instantDraft && !fastDraftRequest && !queueHashValidation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "vault_queue_hash_mismatch",
          message:
            "Active context is out of date. Refresh Keyword Tracker, then try generating again.",
        },
      },
      { status: 409 },
    );
  }

  // ── Intel modules guard (423 Locked) + Visual alignment warnings ─────────────
  // • Hard block (423): any Spy/Reviews/Market module has DISCOVERY-state items.
  // • Soft warning: detected text archetype ≠ approved visual archetype on the
  //   asset manifest for this queueHash.  Warnings are threaded into the 202
  //   response — the client surfaces them as a non-blocking banner.
  // Skipped for instantDraft/fastDraft — those paths bypass vault context.
  let collectedVisualWarnings: VisualAlignmentWarning[] = [];

  if (!instantDraft && !fastDraftRequest) {
    const intelCheck = await checkIntelModulesReady(
      supabase,
      workspaceId,
      vaultLocale,
      bodyAppId ?? null,
      { queueHash },
    );

    collectedVisualWarnings = intelCheck.visualWarnings;

    if (intelCheck.blocked) {
      // Structured server log — queryable by correlationId (queueHash) in log
      // aggregators.  Includes blocking item IDs and content previews so SREs
      // can identify exactly which competitor signals need user review.
      console.log(
        JSON.stringify({
          event: "intel_module_guard_blocked",
          correlationId: queueHash,
          workspaceId,
          locale: vaultLocale,
          appId: bodyAppId ?? null,
          module: intelCheck.module,
          discoveryCount: intelCheck.discoveryCount,
          blockingItems: intelCheck.blockingItems,
          step,
        }),
      );

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "intel_module_processing",
            message: intelCheck.message,
            module: intelCheck.module,
            discoveryCount: intelCheck.discoveryCount,
            // Return blocking item details so the client can deep-link the user
            // directly to the specific competitors that need review.
            blockingItems: intelCheck.blockingItems,
          },
          ...(collectedVisualWarnings.length > 0
            ? { visualWarnings: collectedVisualWarnings }
            : {}),
        },
        { status: 423 },
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const billsCredits = isCreditBilledStep(step, { isDraft: instantDraft });
  const billsModularPhase = billsModularListingPhase(step, isRegenerate ?? false);

  if (bodyAppId) {
    const { data: appOk, error: appLookupErr } = await supabase
      .from("apps")
      .select("id")
      .eq("id", bodyAppId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (appLookupErr || !appOk) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "invalid_app",
            message: "App not found in this workspace.",
          },
        },
        { status: 400 },
      );
    }
  }

  if (shouldLogGeminiDebug()) {
    console.log("=== Generate Full Listing Started ===");
    console.log("App Name:", listingInput.appName);
    console.log("Category:", listingInput.category);
    console.log("Keywords:", listingInput.targetKeywords);
    console.log("Features:", listingInput.appFeatures);
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "forbidden", message: "Workspace not found or inaccessible" },
      },
      { status: 403 },
    );
  }

  const rate = await consumeRateLimit(
    admin,
    `listing_generate:${user.id}`,
    rateLimitMax(),
  );
  if (!rate.allowed) {
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: "rate_limited",
      meta: { count: rate.count, user_id: user.id },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "rate_limited",
          message: "Too many requests. Try again in a minute.",
        },
      },
      { status: 429 },
    );
  }

  // ── Workspace-scoped idempotency lock ────────────────────────────────────────
  // Reject duplicate generation POSTs for the same workspace within 4 seconds to
  // prevent double credit deduction from double-clicks / network retries.
  if (!acquireGenerationLock(workspaceId, LOCK_ACTION)) {
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: "idempotency_lock_held",
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "duplicate_request",
          message:
            "A generation is already in progress for this workspace. Please wait a moment before trying again.",
        },
      },
      { status: 429 },
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const model = resolveGeminiModel();
  const creditCost = billsCredits ? AI_CREDIT_COSTS.listing_generation : 0;

  // All paths past the idempotency lock must release it so the user can retry
  // after any error without waiting for the full TTL to expire.
  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: `wallet_balance_read:${balancePre.code}`,
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "wallet_error",
          message: "Could not read AI credit balance. Try again shortly.",
        },
      },
      { status: 503 },
    );
  }
  if (billsCredits && balancePre.remaining < creditCost) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - startTime,
      errorMessage: "insufficient_credits",
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        remaining: balancePre.remaining,
        required: creditCost,
        precheck: true,
      },
    });
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balancePre.remaining),
      { status: 402 },
    );
  }


  const fetchedOptimizerContext =
    effectiveIncludeOptimizerContext && !useOptimizedPipeline()
      ? await fetchOptimizedContext(supabase, {
          workspaceId,
          locale: vaultLocale,
          appId: bodyAppId,
        })
      : null;

  const listingInputEnriched = enrichListingInputWithRequestKeywords(listingInput);

  let contextResolution;
  try {
    contextResolution = await resolvePrecomputedGenerationContext({
      supabase,
      workspaceId,
      locale: vaultLocale,
      appId: bodyAppId,
      listingInput: listingInputEnriched,
      includeOptimizerContext: effectiveIncludeOptimizerContext,
      isDraft: instantDraft,
      isFinalize: step === "finalize",
      fetchedLegacyContext: fetchedOptimizerContext,
    });
  } catch (e) {
    if (e instanceof ContextPackageUnavailableError) {
      releaseGenerationLock(workspaceId, LOCK_ACTION);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: e.code,
            message: e.message,
          },
        },
        { status: 409 },
      );
    }
    throw e;
  }

  const gatedListingInput = contextResolution.gatedListingInput;
  const listingInputForGeneration = applyCompiledContextToListingInput(
    gatedListingInput,
    gatewayCompiledContext,
  );
  const isSignalEnhanced = computeIsSignalEnhanced(listingInputForGeneration);
  const requestKeywordCount = Math.max(
    listingInputEnriched.targetKeywords.length,
    listingInputForGeneration.trackedKeywordSignals?.length ?? 0,
  );
  const effectiveVaultItemCount = resolveEffectiveVaultItemCount({
    vaultItemCount: queueHashValidation.itemCount,
    requestKeywordCount,
    clientQueueItemCount: clientQueueItemCount ?? queueHashValidation.clientQueueItemCount,
  });

  logTrackedKeywordSignalsPreflight({
    workspaceId,
    step,
    appId: bodyAppId,
    vaultLocale,
    trackedKeywordSignals: listingInputForGeneration.trackedKeywordSignals,
    queueHash,
  });

  const queueHashValidationEarly = queueHashValidation;

  const signalCount = (listingInputForGeneration.activeSignalTypes ?? activeSignalTypes ?? []).length;
  const qualityMeta =
    signalCount >= 4
      ? { quality_status: "All signals active. Synthesis mode: Maximum." as const }
      : signalCount >= 2
        ? {
            quality_status:
              "Multi-signal synthesis active. Keyword Tracker terms prioritized in copy." as const,
          }
        : {
            quality_warning:
              "Listing generated using partial data. Stage Keyword Tracker terms plus Review, Market, or Competitor signals for a stronger strategy." as const,
          };

  logActiveContextAudit(
    buildContextAuditSnapshot({
      route: `${ROUTE} [${step}]`,
      workspaceId,
      appId: bodyAppId,
      listing: listingInputForGeneration,
      activeSignalTypes: listingInputForGeneration.activeSignalTypes ?? activeSignalTypes,
      queueHash: {
        client: queueHash,
        server: queueHashValidationEarly.serverQueueHash,
        validation: queueHashValidationEarly.ok ? "matched" : "mismatch",
        vaultLocale,
        vaultItemCount: effectiveVaultItemCount,
        ...(queueHashValidationEarly.clientQueueItemCount != null
          ? { clientQueueItemCount: queueHashValidationEarly.clientQueueItemCount }
          : clientQueueItemCount != null
            ? { clientQueueItemCount }
            : {}),
      },
    }),
  );

  const preflightWarnings = dedupeWarnings([
    ...assessListingInputWarnings(
      { ...input, trackedKeywordSignals: listingInputForGeneration.trackedKeywordSignals },
      queueHashValidationEarly,
    ),
    ...(fetchedOptimizerContext?.vaultWarnings ?? []),
    ...(!isSignalEnhanced && effectiveIncludeOptimizerContext
      ? [
          {
            code: "missing_tracker_signals" as const,
            severity: "warning" as const,
            message:
              "Fast-Draft returned without signal enhancement. Stage Keyword Tracker terms for richer copy.",
          },
        ]
      : []),
  ]);

  const generationPipeline = contextResolution.pipeline;
  const contextPackage = contextResolution.contextPackage;

  if (billsModularPhase) {
    const { data: wsBilling } = await supabase
      .from("workspaces")
      .select("trial_regenerations_used, ai_credits_remaining")
      .eq("id", workspaceId)
      .maybeSingle();
    const trialUsed =
      typeof wsBilling?.trial_regenerations_used === "number"
        ? wsBilling.trial_regenerations_used
        : 0;
    const creditsRemainingPrecheck =
      typeof wsBilling?.ai_credits_remaining === "number"
        ? wsBilling.ai_credits_remaining
        : balancePre.remaining;
    if (
      trialUsed >= MODULAR_TRIAL_REGENERATIONS_LIMIT &&
      creditsRemainingPrecheck < AI_CREDIT_COSTS.modular_listing_regenerate
    ) {
      releaseGenerationLock(workspaceId, LOCK_ACTION);
      await logUsage(admin, {
        route: ROUTE,
        clientIp,
        success: false,
        durationMs: Date.now() - startTime,
        errorMessage: "insufficient_credits",
        meta: {
          user_id: user.id,
          workspace_id: workspaceId,
          remaining: creditsRemainingPrecheck,
          required: AI_CREDIT_COSTS.modular_listing_regenerate,
          precheck: true,
          trial_regenerations_used: trialUsed,
        },
      });
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(
          AI_CREDIT_COSTS.modular_listing_regenerate,
          creditsRemainingPrecheck,
        ),
        { status: 402 },
      );
    }
  }

  let queueHashLockHeld = false;
  if (!instantDraft && !fastDraftRequest && queueHash) {
    const queueLock = await acquireGenerationQueueHashLock({
      workspaceId,
      queueHash,
      userId: user.id,
    });
    if (!queueLock.acquired) {
      releaseGenerationLock(workspaceId, LOCK_ACTION);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "generation_in_progress",
            message:
              "A listing generation is already in progress for this optimization queue. Please wait for it to finish.",
          },
        },
        { status: 429 },
      );
    }
    queueHashLockHeld = true;
  }

  // ── Async queue producer (QStash) ───────────────────────────────────────────
  if (!instantDraft && !fastDraftRequest) {
    // Instant-draft / client-only modular state may not have flushed
    // persisted_phases to the DB. Sync from the request before the read-mode
    // phase guard so finalize is not blocked with missingPhases: [title, short, long].
    if (
      (step === "finalize" || step === "full") &&
      input.modularListing &&
      queueHash?.trim()
    ) {
      await ensureModularListingDraftPersisted(supabase, {
        workspaceId,
        userId: user.id,
        appId: bodyAppId ?? null,
        queueHash,
        vaultLocale,
        modularListing: input.modularListing,
      });
    }

    try {
      await runListingGenerationOrchestrator({
        executionMode: "read",
        step,
        body: { ...input, ...listingInputForGeneration },
        supabase,
        workspaceId,
        userId: user.id,
        appId: bodyAppId,
        clientIp,
        model,
        headerWorkspaceId,
        isDraft: false,
      });
    } catch (phaseError) {
      if (phaseError instanceof ModularPhaseOrderError) {
        releaseGenerationLock(workspaceId, LOCK_ACTION);
        if (queueHashLockHeld) {
          await releaseGenerationQueueHashLock(workspaceId, queueHash);
        }
        const activeJob = await findActiveJobByQueueHash(workspaceId, queueHash);
        return waitingForPhasesResponse(
          workspaceId,
          queueHash,
          activeJob?.jobId,
          phaseError.missingPhases,
        );
      }
      throw phaseError;
    }

    // Modular phases + billed full unlock run synchronously — immediate 200.
    // Heavy vault contexts route to async worker to avoid MAX_TOKENS / timeout (P0 G8).
    const asyncFullDecision =
      step === "full"
        ? shouldPreferAsyncFullUnlock({
            vaultItemCount: effectiveVaultItemCount,
            clientQueueItemCount:
              queueHashValidationEarly.clientQueueItemCount ??
              clientQueueItemCount,
            listingInput: listingInputForGeneration,
          })
        : { preferAsync: false, reason: null };

    if (asyncFullDecision.preferAsync && shouldLogGeminiDebug()) {
      console.log(
        JSON.stringify({
          event: "listing_full_prefer_async",
          workspaceId,
          reason: asyncFullDecision.reason,
        }),
      );
    }

    const runStepSynchronously =
      SYNC_LISTING_STEPS.has(step) &&
      !(step === "full" && asyncFullDecision.preferAsync);

    if (runStepSynchronously) {
      if (step === "full") {
        await clearListingGenerationJobState(workspaceId, queueHash);
      }

      try {
        const syncPayload: ListingGenerationJobPayload = {
          version: LISTING_GENERATION_JOB_PAYLOAD_VERSION,
          workspaceId,
          userId: user.id,
          clientIp,
          headerWorkspaceId: headerWorkspaceId ?? null,
          step,
          body: input,
          listingInputForGeneration,
          gatewayCompiledContext,
          pipeline: generationPipeline,
          contextPackage,
          preflightWarnings,
          model,
          creditCost,
          billsCredits,
          billsModularPhase,
          isRegenerate: isRegenerate ?? false,
          qualityMeta,
        };

        const syncResult = await executeListingGenerationSync({
          supabase,
          admin,
          payload: syncPayload,
          startTime,
          clientIp,
        });

        if (queueHashLockHeld) {
          await releaseGenerationQueueHashLock(workspaceId, queueHash);
        }
        releaseGenerationLock(workspaceId, LOCK_ACTION);

        await logUsage(admin, {
          route: ROUTE,
          clientIp,
          success: true,
          durationMs: Date.now() - startTime,
          meta: {
            user_id: user.id,
            workspace_id: workspaceId,
            generation_step: step,
            async: false,
            sync: true,
          },
        });

        if (step === "full") {
          const fullData = syncResult.data as Record<string, unknown> | undefined;
          if (fullData && typeof fullData.title === "string") {
            try {
              await createListingVersion({
                workspaceId,
                appId: bodyAppId ?? null,
                vaultLocale,
                createdBy: user.id,
                sourceQueueHash: queueHash,
                sourceGenerationId:
                  typeof syncResult.meta?.generationId === "string"
                    ? syncResult.meta.generationId
                    : null,
                title: clampPlayStoreTitle(fullData.title),
                shortDescription:
                  typeof fullData.shortDescription === "string"
                    ? fullData.shortDescription
                    : null,
                longDescription:
                  typeof fullData.fullDescription === "string"
                    ? fullData.fullDescription
                    : null,
                keywordSuggestions: Array.isArray(fullData.keywordSuggestions)
                  ? (fullData.keywordSuggestions as string[])
                  : [],
                ctaSuggestions: Array.isArray(fullData.ctaSuggestions)
                  ? (fullData.ctaSuggestions as string[])
                  : [],
              });
            } catch (versionErr) {
              console.warn(
                JSON.stringify({
                  event: "listing_version_sync_full_create_failed",
                  workspaceId,
                  queueHash,
                  message:
                    versionErr instanceof Error
                      ? versionErr.message
                      : String(versionErr),
                }),
              );
            }
          }

          return NextResponse.json({
            ok: true,
            accepted: false,
            generationStep: syncResult.generationStep,
            data: syncResult.data,
            ...(syncResult.modularDraftShort != null
              ? { modularDraftShort: syncResult.modularDraftShort }
              : {}),
            ...(syncResult.warnings ? { warnings: syncResult.warnings } : {}),
            meta: {
              ...syncResult.meta,
              isDraft: false as const,
              creditsCharged: syncResult.meta?.creditsCharged ?? 0,
              creditsRemaining: syncResult.meta?.creditsRemaining,
            },
          });
        }

        return NextResponse.json({
          ok: true,
          accepted: false,
          generationStep: syncResult.generationStep,
          modularData: syncResult.modularData,
          ...(syncResult.warnings ? { warnings: syncResult.warnings } : {}),
          meta: syncResult.meta,
        });
      } catch (syncStepError) {
        try {
          if (queueHashLockHeld) {
            await releaseGenerationQueueHashLock(workspaceId, queueHash);
          }
          releaseGenerationLock(workspaceId, LOCK_ACTION);
        } catch (lockReleaseError) {
          console.warn(
            JSON.stringify({
              event: "sync_full_lock_release_failed",
              workspaceId,
              queueHash,
              message:
                lockReleaseError instanceof Error
                  ? lockReleaseError.message
                  : String(lockReleaseError),
            }),
          );
        }

        if (syncStepError instanceof ModularPhaseOrderError) {
          return waitingForPhasesResponse(
            workspaceId,
            queueHash,
            undefined,
            syncStepError.missingPhases,
          );
        }
        if (syncStepError instanceof ListingGenerationUnavailableError) {
          console.log(
            JSON.stringify({
              event: "sync_generation_unavailable",
              workspaceId,
              queueHash,
              step,
              message: syncStepError.message,
            }),
          );
          return NextResponse.json(
            {
              ok: false,
              error: { code: "generation_unavailable", message: syncStepError.message },
            },
            { status: 500 },
          );
        }
        if (
          syncStepError instanceof MissingKeywordContextError ||
          syncStepError instanceof KeywordContextRequiredError
        ) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "missing_keyword_context",
                message: syncStepError.message,
              },
            },
            { status: 422 },
          );
        }
        if (syncStepError instanceof ContextGatewayError) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: syncStepError.code,
                message: syncStepError.message,
              },
            },
            { status: 503 },
          );
        }
        const syncMessage =
          syncStepError instanceof Error
            ? syncStepError.message
            : "Sync listing generation failed.";
        console.log(
          JSON.stringify({
            event: "sync_generation_failed",
            workspaceId,
            queueHash,
            step,
            errorName:
              syncStepError instanceof Error ? syncStepError.name : undefined,
            message: syncMessage,
            stack:
              syncStepError instanceof Error ? syncStepError.stack : undefined,
          }),
        );
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "generation_failed",
              message: syncMessage,
            },
          },
          { status: 500 },
        );
      }
    }

    const existingJob = await findActiveJobByQueueHash(workspaceId, queueHash);
    if (existingJob) {
      releaseGenerationLock(workspaceId, LOCK_ACTION);
      try {
        await republishListingGenerationWorker(existingJob.jobId);
      } catch (republishError) {
        console.warn(
          JSON.stringify({
            event: "listing_generation_republish_failed",
            jobId: existingJob.jobId,
            workspaceId,
            queueHash,
            message:
              republishError instanceof Error
                ? republishError.message
                : String(republishError),
          }),
        );
      }
      return NextResponse.json(
        {
          ok: true,
          accepted: true,
          jobId: existingJob.jobId,
          status: existingJob.status,
          ...(collectedVisualWarnings.length > 0
            ? { visualWarnings: collectedVisualWarnings }
            : {}),
        },
        { status: 202 },
      );
    }

    const jobPayload: ListingGenerationJobPayload = {
      version: LISTING_GENERATION_JOB_PAYLOAD_VERSION,
      workspaceId,
      userId: user.id,
      clientIp,
      headerWorkspaceId: headerWorkspaceId ?? null,
      step,
      body: input,
      listingInputForGeneration: listingInputForGeneration,
      gatewayCompiledContext,
      pipeline: generationPipeline,
      contextPackage,
      preflightWarnings,
      model,
      creditCost,
      billsCredits,
      billsModularPhase,
      isRegenerate: isRegenerate ?? false,
      qualityMeta,
    };

    const { jobId, status } = await createListingGenerationJob({
      workspaceId,
      userId: user.id,
      appId: bodyAppId,
      vaultLocale,
      queueHash,
      payload: jobPayload,
    });

    // ── Create a placeholder ListingVersion before returning 202 ──────────────
    // Linked to this job via source_job_id so the worker can back-fill content
    // on completion.  The client receives versionId immediately, enabling live
    // version history before the pipeline finishes.
    let versionId: string | undefined;
    try {
      const version = await createListingVersion({
        workspaceId,
        appId: bodyAppId ?? null,
        vaultLocale,
        createdBy: user.id,
        sourceQueueHash: queueHash,
        sourceJobId: jobId,
      });
      versionId = version.id;
    } catch (versionErr) {
      // Non-fatal — version tracking failure should not block generation
      console.warn(
        JSON.stringify({
          event: "listing_version_placeholder_create_failed",
          jobId,
          workspaceId,
          error:
            versionErr instanceof Error
              ? versionErr.message
              : String(versionErr),
        }),
      );
    }

    let publishFailed = false;
    try {
      await publishListingGenerationWorker(jobId);
    } catch (publishError) {
      publishFailed = true;
      console.error(
        JSON.stringify({
          event: "listing_worker_publish_failed_falling_back_to_sync",
          jobId,
          workspaceId,
          error:
            publishError instanceof Error
              ? publishError.message
              : String(publishError),
        }),
      );
    }

    // ── Publish-failure sync fallback ────────────────────────────────────────
    // When the worker cannot be enqueued (QStash unavailable, missing
    // INTERNAL_WORKER_SECRET in dev, etc.) run the generation synchronously
    // within this request rather than returning a 503.  This prevents the
    // "taking longer than expected" timeout that users would otherwise see
    // when the poll keeps reading "pending" forever.
    if (publishFailed) {
      if (queueHashLockHeld) {
        await releaseGenerationQueueHashLock(workspaceId, queueHash);
      }
      releaseGenerationLock(workspaceId, LOCK_ACTION);

      try {
        const syncFallbackPayload: ListingGenerationJobPayload = {
          version: LISTING_GENERATION_JOB_PAYLOAD_VERSION,
          workspaceId,
          userId: user.id,
          clientIp,
          headerWorkspaceId: headerWorkspaceId ?? null,
          step,
          body: input,
          listingInputForGeneration,
          gatewayCompiledContext,
          pipeline: generationPipeline,
          contextPackage,
          preflightWarnings,
          model,
          creditCost,
          billsCredits,
          billsModularPhase,
          isRegenerate: isRegenerate ?? false,
          qualityMeta,
        };

        const syncResult = await executeListingGenerationSync({
          supabase,
          admin,
          payload: syncFallbackPayload,
          startTime,
          clientIp,
        });

        return NextResponse.json({
          ok: true,
          accepted: false,
          generationStep: syncResult.generationStep,
          ...(syncResult.modularData != null
            ? { modularData: syncResult.modularData }
            : { data: syncResult.data }),
          ...(syncResult.modularDraftLong != null
            ? { modularDraftLong: syncResult.modularDraftLong }
            : {}),
          ...(syncResult.modularDraftShort != null
            ? { modularDraftShort: syncResult.modularDraftShort }
            : {}),
          ...(syncResult.warnings ? { warnings: syncResult.warnings } : {}),
          meta: {
            ...syncResult.meta,
            isDraft: false as const,
            creditsCharged: syncResult.meta?.creditsCharged ?? 0,
            fallbackSync: true,
          },
        });
      } catch (syncFallbackError) {
        const msg =
          syncFallbackError instanceof Error
            ? syncFallbackError.message
            : "Sync fallback failed";
        return NextResponse.json(
          { ok: false, error: { code: "queue_publish_failed", message: msg } },
          { status: 503 },
        );
      }
    }

    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - startTime,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        generation_step: step,
        job_id: jobId,
        async: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        jobId,
        status,
        queueHash,
        workspaceId,
        // versionId allows the client to track this version in the history panel
        ...(versionId ? { versionId } : {}),
        ...(collectedVisualWarnings.length > 0
          ? { visualWarnings: collectedVisualWarnings }
          : {}),
      },
      { status: 202 },
    );
  }

  // ── Synchronous instant-draft path ──────────────────────────────────────────
  if (instantDraft || fastDraftRequest) {
    try {
      const syncPayload: ListingGenerationJobPayload = {
        version: LISTING_GENERATION_JOB_PAYLOAD_VERSION,
        workspaceId,
        userId: user.id,
        clientIp,
        headerWorkspaceId: headerWorkspaceId ?? null,
        step,
        body: input,
        listingInputForGeneration,
        gatewayCompiledContext,
        pipeline: generationPipeline,
        contextPackage,
        preflightWarnings,
        model,
        creditCost: 0,
        billsCredits: false,
        billsModularPhase: false,
        isRegenerate: false,
        qualityMeta,
      };

      const syncResult = await executeListingGenerationSync({
        supabase,
        admin,
        payload: syncPayload,
        startTime,
        clientIp,
      });

      releaseGenerationLock(workspaceId, LOCK_ACTION);

      return NextResponse.json({
        ok: true,
        accepted: false,
        generationStep: syncResult.generationStep,
        ...(syncResult.modularData != null
          ? { modularData: syncResult.modularData }
          : { data: syncResult.data }),
        ...(syncResult.modularDraftLong != null
          ? { modularDraftLong: syncResult.modularDraftLong }
          : {}),
        ...(syncResult.modularDraftShort != null
          ? { modularDraftShort: syncResult.modularDraftShort }
          : {}),
        ...(syncResult.warnings ? { warnings: syncResult.warnings } : {}),
        meta: {
          ...syncResult.meta,
          isDraft: true as const,
          creditsCharged: 0,
        },
      });
    } catch (e) {
      releaseGenerationLock(workspaceId, LOCK_ACTION);

      // Prerequisite phases (title / short / long) not yet persisted to the DB —
      // return the same 202 WAITING_FOR_PHASES shape the async path produces so
      // the client's auto-chain logic in useModularGeneration.ts handles it
      // identically regardless of whether generation ran sync or async.
      if (e instanceof ModularPhaseOrderError) {
        if (queueHashLockHeld) {
          await releaseGenerationQueueHashLock(workspaceId, queueHash);
        }
        return waitingForPhasesResponse(workspaceId, queueHash, undefined, e.missingPhases);
      }

      if (e instanceof ListingGenerationUnavailableError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "generation_unavailable", message: e.message },
          },
          { status: 500 },
        );
      }
      throw e;
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: { code: "internal_error", message: "Invalid listing generation path" },
    },
    { status: 500 },
  );
}
/**
 * PATCH /api/listings/generate
 *
 * Back-fills `app_features` and `target_keywords` on a generation row with the
 * AI-generated values. Called client-side immediately after a successful POST so
 * that a page refresh hydrates the AI copy rather than the pre-generation input.
 *
 * Body: { generationId: string; workspaceId: string; appFeatures: string; targetKeywords: string[] }
 */
export async function PATCH(request: NextRequest) {
  const { supabase, user } = await resolveAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const patchSchema = z.object({
    generationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    appFeatures: z.string().max(10_000),
    targetKeywords: z.array(z.string().max(200)).max(100),
  });

  let input: z.infer<typeof patchSchema>;
  try {
    input = patchSchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid input", details: e.flatten() },
        },
        { status: 400 },
      );
    }
    throw e;
  }

  await patchListingGenerationInputs(supabase, {
    generationId: input.generationId,
    workspaceId: input.workspaceId,
    userId: user.id,
    appFeatures: input.appFeatures,
    targetKeywords: input.targetKeywords,
  });

  return NextResponse.json({ ok: true });
}
