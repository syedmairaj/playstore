import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { generateMarketCaptureWithGemini } from "@/lib/gemini/generate-market-capture";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { buildMarketCaptureContext } from "@/lib/market-capture/market-capture-context";
import { getMarketCapturePromptVersion } from "@/lib/market-capture/market-capture-prompt";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/usage-log";
import { marketCaptureBodySchema } from "@/lib/validation/market-capture-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";

export const maxDuration = 300;

const ROUTE = "POST /api/listings/market-capture";
const CREDIT_KEY = "listing_generation" as const;

function rateLimitMax(): number {
  const raw = process.env.RATE_LIMIT_MAX;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
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
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_json", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = marketCaptureBodySchema.parse(body);
  } catch (e) {
    const message =
      e instanceof ZodError
        ? e.errors.map((err) => err.message).join("; ")
        : "Invalid request body.";
    return NextResponse.json(
      { ok: false, error: { code: "validation", message } },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(supabase, parsed.workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member." } },
      { status: 403 },
    );
  }

  const rateKey = `market_capture:${user.id}`;
  const { allowed } = await consumeRateLimit(admin, rateKey, rateLimitMax());
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "rate_limit", message: "Too many requests. Try again shortly." } },
      { status: 429 },
    );
  }

  const cost = AI_CREDIT_COSTS[CREDIT_KEY];
  const creditsBefore = await readWorkspaceAiCreditsRemaining(supabase, parsed.workspaceId);
  if (creditsBefore < cost) {
    return NextResponse.json(
      { ok: false, error: buildInsufficientAiCreditsPayload(cost, creditsBefore) },
      { status: 402 },
    );
  }

  await consumeWorkspaceAiCredits(supabase, {
    workspaceId: parsed.workspaceId,
    amount: cost,
    description: "Market Capture dual listing proposals",
    sourceType: "generation",
  });

  try {
    const ctx = buildMarketCaptureContext({
      locale: parsed.locale,
      competitorName: parsed.competitorName,
      appName: parsed.appName,
      category: parsed.category,
      appFeatures: parsed.appFeatures,
      queueItems: parsed.queueItems as OptimizationQueueItem[],
      seedKeywords: parsed.seedKeywords,
      currentListing: parsed.currentListing,
    });

    const data = await generateMarketCaptureWithGemini(ctx);
    const creditsRemaining = await readWorkspaceAiCreditsRemaining(supabase, parsed.workspaceId);

    await logUsage(admin, {
      route: ROUTE,
      userId: user.id,
      ip: clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        workspaceId: parsed.workspaceId,
        promptVersion: getMarketCapturePromptVersion(),
        competitorName: parsed.competitorName,
        locale: parsed.locale,
      },
    });

    return NextResponse.json({
      ok: true,
      data,
      meta: { creditsRemaining, creditsCharged: cost },
    });
  } catch (e) {
    await refundWorkspaceAiCredits(supabase, {
      workspaceId: parsed.workspaceId,
      amount: cost,
      description: "Market Capture generation failed — refund",
      sourceType: "refund",
    });

    const isModel = e instanceof InvalidModelOutputError;
    await logUsage(admin, {
      route: ROUTE,
      userId: user.id,
      ip: clientIp,
      success: false,
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message : "Unknown error",
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: isModel ? e.apiErrorCode : "generation_failed",
          message: isModel
            ? e.message
            : "Market Capture generation failed. Credits were refunded.",
          ...(isModel && e.truncated ? { truncated: true } : {}),
        },
      },
      { status: isModel ? 422 : 500 },
    );
  }
}
