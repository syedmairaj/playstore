import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { upsertOptimizerInputsAfterAutofill } from "@/lib/db/listing-generations";
import { generateOptimizerAutofillWithGemini } from "@/lib/gemini/generate-optimizer-autofill";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/usage-log";
import { listingOptimizerAutofillBodySchema } from "@/lib/validation/listing-optimizer-autofill-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  acquireGenerationLock,
  releaseGenerationLock,
} from "@/lib/server/generation-idempotency-lock";

export const maxDuration = 300;

const ROUTE = "POST /api/listings/optimizer-autofill";
const LOCK_ACTION = "listing_optimizer_autofill";

function inferOptimizerAutofillHttpStatus(error: unknown): number {
  const message =
    error instanceof Error ? error.message : String(error);

  // Check for status codes in error message
  if (/\b429\b/.test(message)) return 429;
  if (/\b503\b/.test(message) || /\b502\b/.test(message) || /\b504\b/.test(message)) return 503;
  if (/\b404\b/.test(message)) return 503;

  const lower = message.toLowerCase();
  if (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    /\b429\b/.test(message)
  ) {
    return 429;
  }
  if (
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("deadline exceeded") ||
    /\b503\b/.test(message) ||
    /\b502\b/.test(message) ||
    /\b504\b/.test(message) ||
    (lower.includes("not found") &&
      (lower.includes("model") || lower.includes("models/")))
  ) {
    return 503;
  }

  return 500;
}

function rateLimitMax(): number {
  const raw = process.env.RATE_LIMIT_MAX;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function splitKeywordLines(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export async function POST(request: NextRequest) {
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

  let input;
  try {
    input = listingOptimizerAutofillBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
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
    appName,
    category,
    field,
    language,
    appId: bodyAppId,
    toneStyle = "professional",
    keywordsDraft = "",
    featuresDraft = "",
  } = input;

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
    `listing_optimizer_autofill:${user.id}`,
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
  // Reject duplicate autofill POSTs for the same workspace within 4 seconds to
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

  const creditCost = AI_CREDIT_COSTS.listing_optimizer_autofill;

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
  if (balancePre.remaining < creditCost) {
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
        field,
      },
    });
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balancePre.remaining),
      { status: 402 },
    );
  }

  let ledgerId: string | null = null;
  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: `Listing optimizer AI autofill (${field})`,
    sourceType: "generation",
    meta: { route: ROUTE, tool: "aso_listing_autofill", model, field },
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
          field,
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

  try {
    const text = await generateOptimizerAutofillWithGemini({
      appName,
      category,
      field,
      language,
    });

    let persistedInputs = false;
    let persistedGenerationId: string | undefined;
    let persistedSavedAt: string | undefined;
    if (bodyAppId) {
      const targetKeywords =
        field === "keywords"
          ? splitKeywordLines(text)
          : splitKeywordLines(keywordsDraft);
      const appFeatures =
        field === "features" ? text.trim() : featuresDraft.trim();

      const persist = await upsertOptimizerInputsAfterAutofill(supabase, {
        workspaceId,
        userId: user.id,
        appId: bodyAppId,
        appName,
        category,
        targetKeywords,
        appFeatures,
        toneStyle,
        clientIp,
        model,
      });
      persistedInputs = persist.ok;
      if (persist.ok) {
        persistedGenerationId = persist.generationId;
        persistedSavedAt = persist.createdAt;
      }
    }

    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        field,
        model,
        persisted_inputs: persistedInputs,
      },
    });
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    return NextResponse.json({
      ok: true,
      data: { text, field },
      meta: {
        model,
        creditsCharged: creditCost,
        creditsRemaining: debit.balanceAfter,
        persistedInputs,
        ...(persistedGenerationId && persistedSavedAt
          ? { generationId: persistedGenerationId, savedAt: persistedSavedAt }
          : {}),
      },
    });
  } catch (e) {
    if (ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId,
        userId: user.id,
        reason: "Listing optimizer autofill failed before a saved result",
      });
    }
    const internalMessage =
      e instanceof Error ? e.message : "Autofill failed unexpectedly";
    const status = inferOptimizerAutofillHttpStatus(e);
    const isProd = process.env.NODE_ENV === "production";
    const clientMessage = isProd
      ? status === 429
        ? "The AI service is busy. Please try again in a moment."
        : status === 503
          ? "The AI service is temporarily unavailable. Please try again shortly."
          : "Autofill could not be completed. Please try again shortly."
      : internalMessage;
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: internalMessage.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId, field },
    });
    return NextResponse.json(
      {
        ok: false,
        error: { code: "generation_error", message: clientMessage },
      },
      { status },
    );
  }
}
