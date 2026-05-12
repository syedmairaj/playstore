import {
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
} from "@google/generative-ai";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { generateOptimizerAutofillWithGemini } from "@/lib/gemini/generate-optimizer-autofill";
import { resolveGeminiModel } from "@/lib/gemini/gemini-defaults";
import { logGeminiApiKeyDiagnostics } from "@/lib/gemini/log-gemini-env";
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

const ROUTE = "POST /api/listings/optimizer-autofill";

function inferOptimizerAutofillHttpStatus(error: unknown): number {
  if (error instanceof GoogleGenerativeAIFetchError) {
    const s = error.status;
    if (s === 429) return 429;
    if (s === 503 || s === 502 || s === 504) return 503;
    if (s === 404) return 503;
  }
  if (error instanceof GoogleGenerativeAIResponseError) {
    return 503;
  }

  const message =
    error instanceof Error ? error.message : String(error);
  if (message.includes("GEMINI_API_KEY")) return 503;

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

  const { workspaceId, appName, category, field, language } = input;

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

  const model = resolveGeminiModel();
  const creditCost = AI_CREDIT_COSTS.listing_optimizer_autofill;

  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
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
      },
    });
    return NextResponse.json({
      ok: true,
      data: { text, field },
      meta: {
        model,
        creditsCharged: creditCost,
        creditsRemaining: debit.balanceAfter,
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
