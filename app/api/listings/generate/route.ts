import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { insertListingGeneration } from "@/lib/db/listing-generations";
import { generateListingWithGemini } from "@/lib/gemini/generate-listing";
import {
  AI_CREDIT_COSTS,
  consumeWorkspaceAiCredits,
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

  const { workspaceId, ...listingInput } = input;

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

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const promptVersion = getListingOptimizerPromptVersion();
  const creditCost = AI_CREDIT_COSTS.listing_generation;

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
        {
          ok: false,
          error: {
            code: "insufficient_credits",
            message: "Workspace is out of AI credits. Upgrade or top up to continue.",
            remaining: debit.remaining ?? 0,
            required: debit.required ?? creditCost,
          },
        },
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
    const data = await generateListingWithGemini(listingInput);
    const persist = await insertListingGeneration(supabase, {
      input: listingInput,
      output: data,
      clientIp,
      model,
      promptVersion,
      workspaceId,
      userId: user.id,
      creditsLedgerId: ledgerId,
    });
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
      },
    });
  } catch (e) {
    if (ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId,
        userId: user.id,
        reason: "Listing AI generation failed before a saved result",
      });
    }
    const message =
      e instanceof Error ? e.message : "Generation failed unexpectedly";
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: message.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    const status = message.includes("GEMINI_API_KEY") ? 503 : 500;
    return NextResponse.json(
      { ok: false, error: { code: "generation_error", message } },
      { status },
    );
  }
}
