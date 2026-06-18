import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import {
  patchListingGenerationInputs,
} from "@/lib/db/listing-generations";
import { listingModularGenerateBodySchema } from "@/lib/validation/listing-modular-generate-body";
import { isCreditBilledStep } from "@/lib/validation/listing-modular-generate-body";
import {
  orchestratorPromptVersion,
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
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { getModularListingPromptVersion } from "@/lib/prompts/listing-modular";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/usage-log";
import { listingGenerateBodySchema } from "@/lib/validation/listing-generate-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  acquireGenerationLock,
  releaseGenerationLock,
} from "@/lib/server/generation-idempotency-lock";
import {
  buildContextAuditSnapshot,
  logActiveContextAudit,
} from "@/lib/optimization-queue/context-audit-log";
import { validateActiveContextQueueHash } from "@/lib/optimization-queue/validate-active-context-queue-hash";

const ROUTE = "POST /api/listings/generate";
const LOCK_ACTION = "listing_generate";

function rateLimitMax(): number {
  const raw = process.env.RATE_LIMIT_MAX;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export async function POST(request: NextRequest) {
  logGeminiApiKeyDiagnostics();
  const started = Date.now();
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
            message: "Invalid input",
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
    ...listingInput
  } = input;

  const step = generationStep ?? "full";
  const billsCredits = isCreditBilledStep(step);

  // ── Signal quality computation ────────────────────────────────────────────
  // Counts active signal channels (keywords, reviews, market, competitors).
  const signalCount = (activeSignalTypes ?? []).length;
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
      durationMs: Date.now() - started,
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
      durationMs: Date.now() - started,
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
  const promptVersion = billsCredits
    ? orchestratorPromptVersion(step)
    : getModularListingPromptVersion();
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
      durationMs: Date.now() - started,
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
      durationMs: Date.now() - started,
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

  let ledgerId: string | null = null;

  const queueHashValidation = await validateActiveContextQueueHash(supabase, {
    workspaceId,
    locale: vaultLocale,
    appId: bodyAppId,
    clientQueueHash: queueHash,
    clientQueueItemCount,
  });

  logActiveContextAudit(
    buildContextAuditSnapshot({
      route: `${ROUTE} [${step}]`,
      workspaceId,
      appId: bodyAppId,
      listing: listingInput,
      activeSignalTypes,
      queueHash: {
        client: queueHash,
        server: queueHashValidation.serverQueueHash,
        validation: queueHashValidation.ok ? "matched" : "mismatch",
        vaultLocale,
        vaultItemCount: queueHashValidation.itemCount,
        ...(queueHashValidation.clientQueueItemCount != null
          ? { clientQueueItemCount: queueHashValidation.clientQueueItemCount }
          : {}),
      },
    }),
  );

  if (!queueHashValidation.ok) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: "stale_active_context",
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        vault_locale: vaultLocale,
        client_queue_hash: queueHash,
        server_queue_hash: queueHashValidation.serverQueueHash,
        vault_item_count: queueHashValidation.itemCount,
      },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "stale_active_context",
          message:
            "Active Context changed since this page loaded. Refresh your signals and try again.",
        },
      },
      { status: 409 },
    );
  }

  if (billsCredits) {
    const debit = await consumeWorkspaceAiCredits(supabase, {
      workspaceId,
      userId: user.id,
      amount: creditCost,
      description:
        step === "finalize"
          ? "Listing AI finalize (modular pipeline)"
          : "Listing AI generation (Gemini)",
      sourceType: "generation",
      meta: { route: ROUTE, tool: "aso_listing", model, generationStep: step },
    });

    if (!debit.ok) {
      releaseGenerationLock(workspaceId, LOCK_ACTION);
      if (debit.code === "insufficient_credits") {
        await logUsage(admin, {
          route: ROUTE,
          clientIp,
          success: false,
          durationMs: Date.now() - started,
          errorMessage: "insufficient_credits",
          meta: {
            user_id: user.id,
            workspace_id: workspaceId,
            remaining: debit.remaining,
            required: debit.required ?? creditCost,
          },
        });
        return NextResponse.json(
          buildInsufficientAiCreditsPayload(
            debit.required ?? creditCost,
            debit.remaining ?? 0,
          ),
          { status: 402 },
        );
      }

      await logUsage(admin, {
        route: ROUTE,
        clientIp,
        success: false,
        durationMs: Date.now() - started,
        errorMessage: `wallet:${debit.code}`,
        meta: { user_id: user.id, workspace_id: workspaceId },
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "wallet_error",
            message: "Could not reserve credits. Try again shortly.",
          },
        },
        { status: 503 },
      );
    }

    ledgerId = debit.ledgerId;
  }

  try {
    const orchestratorResult = await runListingGenerationOrchestrator({
      step,
      body: input,
      supabase,
      workspaceId,
      userId: user.id,
      appId: bodyAppId,
      clientIp,
      model,
      creditsLedgerId: ledgerId,
    });

    const isFullOrFinalize =
      orchestratorResult.step === "full" || orchestratorResult.step === "finalize";

    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        generation_step: step,
        credits_billed: billsCredits,
        persisted: isFullOrFinalize ? orchestratorResult.persisted : false,
      },
    });
    releaseGenerationLock(workspaceId, LOCK_ACTION);

    if (isFullOrFinalize) {
      return NextResponse.json({
        ok: true,
        generationStep: orchestratorResult.step,
        data: orchestratorResult.data,
        meta: {
          model,
          promptVersion,
          persisted: orchestratorResult.persisted,
          generationId: orchestratorResult.generationId,
          savedAt: orchestratorResult.savedAt,
          asoScorePartial: orchestratorResult.asoScorePartial ? true : undefined,
          retried: orchestratorResult.retried ? true : undefined,
          shortDescriptionClamped: orchestratorResult.shortDescriptionClamped
            ? true
            : undefined,
          creditsCharged: creditCost,
          ...qualityMeta,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      generationStep: orchestratorResult.step,
      modularData: orchestratorResult.data,
      meta: {
        model,
        promptVersion,
        creditsCharged: 0,
        ...qualityMeta,
      },
    });
  } catch (e) {
    if (e instanceof InvalidModelOutputError) {
      if (shouldLogGeminiDebug() && e.zodError) {
        console.error(
          "[listing-generate] Zod error after clamp:",
          e.zodError.flatten(),
        );
      }
      if (ledgerId) {
        await refundWorkspaceAiCredits(supabase, {
          ledgerId,
          userId: user.id,
          reason: "Listing AI generation failed before a saved result",
        });
      }
      releaseGenerationLock(workspaceId, LOCK_ACTION);
      await logUsage(admin, {
        route: ROUTE,
        clientIp,
        success: false,
        durationMs: Date.now() - started,
        errorMessage: e.truncated ? "truncated_model_output" : "invalid_model_output",
        meta: {
          user_id: user.id,
          workspace_id: workspaceId,
          finish_reason: e.finishReason,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: e.apiErrorCode,
            message: e.message,
            truncated: e.truncated ? true : undefined,
          },
        },
        { status: 422 },
      );
    }
    if (shouldLogGeminiDebug()) {
      console.error("=== Generate Full Listing Error ===");
      console.error(e);
      console.error(
        "Error message:",
        (e as { message?: unknown } | null | undefined)?.message,
      );
      console.error(
        "Error stack:",
        (e as { stack?: unknown } | null | undefined)?.stack,
      );
      console.error("String(error):", String(e));
    }
    if (ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId,
        userId: user.id,
        reason: "Listing AI generation failed before a saved result",
      });
    }
    const internalMessage =
      e instanceof Error ? e.message : "Generation failed unexpectedly";
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: internalMessage.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    const status = internalMessage.includes("GEMINI_API_KEY") ? 503 : 500;
    const isProd = process.env.NODE_ENV === "production";
    const clientMessage = isProd
      ? status === 503
        ? "The AI service is temporarily unavailable. Please try again shortly."
        : "Listing generation could not be completed. Please try again shortly."
      : internalMessage;
    return NextResponse.json(
      { ok: false, error: { code: "generation_error", message: clientMessage } },
      { status },
    );
  }
}

/**
 * PATCH /api/listings/generate
 *
 * Back-fills `app_features` and `target_keywords` on a generation row with the
 * AI-generated values. Called client-side immediately after a successful POST so
 * that a page refresh hydrates the AI copy rather than the pre-generation input.
 *
 * Body: { generationId: string; appFeatures: string; targetKeywords: string[] }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    userId: user.id,
    appFeatures: input.appFeatures,
    targetKeywords: input.targetKeywords,
  });

  return NextResponse.json({ ok: true });
}
