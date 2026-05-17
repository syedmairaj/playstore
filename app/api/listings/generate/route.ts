import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { insertListingGeneration } from "@/lib/db/listing-generations";
import { linkListingGenerationToTrackedKeywords } from "@/lib/keywords/link-listing-generation-to-keywords";
import { generateListingWithGemini } from "@/lib/gemini/generate-listing";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
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
import { getListingOptimizerPromptVersion } from "@/lib/prompts/listing-optimizer";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/usage-log";
import { listingGenerateBodySchema } from "@/lib/validation/listing-generate-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/listings/generate";

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

  let input: z.infer<typeof listingGenerateBodySchema>;
  try {
    input = listingGenerateBodySchema.parse(body);
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

  const { workspaceId, appId: bodyAppId, ...listingInput } = input;

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

  const model = resolveGeminiModel();
  const promptVersion = getListingOptimizerPromptVersion();
  const creditCost = AI_CREDIT_COSTS.listing_generation;

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
    description: "Listing AI generation (Gemini)",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "aso_listing", model },
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
    const { data, asoScorePartial } = await generateListingWithGemini(listingInput);
    const persist = await insertListingGeneration(supabase, {
      input: listingInput,
      output: data,
      clientIp,
      model,
      promptVersion,
      workspaceId,
      userId: user.id,
      creditsLedgerId: ledgerId,
      appId: bodyAppId ?? null,
    });
    if (persist.ok && bodyAppId) {
      await linkListingGenerationToTrackedKeywords({
        supabase,
        workspaceId,
        appId: bodyAppId,
        listingGenerationId: persist.id,
      });
    }
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        persisted: persist.ok,
        persist_error: persist.ok ? undefined : persist.message,
      },
    });
    return NextResponse.json({
      ok: true,
      data,
      meta: {
        model,
        promptVersion,
        persisted: persist.ok,
        generationId: persist.ok ? persist.id : undefined,
        savedAt: persist.ok ? persist.createdAt : undefined,
        asoScorePartial: asoScorePartial ? true : undefined,
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
      await logUsage(admin, {
        route: ROUTE,
        clientIp,
        success: false,
        durationMs: Date.now() - started,
        errorMessage: "invalid_model_output",
        meta: { user_id: user.id, workspace_id: workspaceId },
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "invalid_model_output",
            message: e.message,
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
