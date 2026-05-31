import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import {
  generateAppLogos,
  RunwareApiError,
  RunwareNotConfiguredError,
} from "@/lib/features/ai/runware";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/usage-log";
import { listingLogoGenerateBodySchema } from "@/lib/validation/listing-logo-generate-body";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/listings/logo-generate";

export async function POST(request: NextRequest) {
  const started = Date.now();
  const clientIp = getClientIp(request);

  if (!process.env.RUNWARE_API_KEY?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "logo_generation_unconfigured",
          message:
            "AI logo generation is not configured (missing RUNWARE_API_KEY). Add it in the server environment to enable this feature.",
        },
      },
      { status: 503 },
    );
  }

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
          message: "Sign in required.",
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
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input;
  try {
    input = listingLogoGenerateBodySchema.parse(body);
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

  const { workspaceId, appId, appName, category, shortDescription, style, brandColor } = input;

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

  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appErr || !appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "App not found in this workspace" } },
      { status: 404 },
    );
  }

  const creditCost = AI_CREDIT_COSTS.listing_logo_generation;

  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: `wallet_balance_read:${balancePre.code}`,
      meta: { user_id: user.id, workspace_id: workspaceId, app_id: appId },
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
    description: "AI app icon batch (Runware)",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "listing_logo_generation", app_id: appId },
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
    const images = await generateAppLogos({
      appName,
      category,
      shortDescription,
      style,
      brandColor,
    });
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        app_id: appId,
        image_count: images.length,
      },
    });
    return NextResponse.json({
      ok: true,
      images,
      meta: {
        creditsCharged: creditCost,
        creditsRemaining: debit.balanceAfter,
      },
    });
  } catch (e) {
    if (ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId,
        userId: user.id,
        reason: "Runware logo generation failed before a successful response",
      });
    }
    if (e instanceof RunwareNotConfiguredError) {
      await logUsage(admin, {
        route: ROUTE,
        clientIp,
        success: false,
        durationMs: Date.now() - started,
        errorMessage: e.code,
        meta: { user_id: user.id, workspace_id: workspaceId },
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: e.code,
            message:
              "AI logo generation is not configured (missing RUNWARE_API_KEY). Add it in the server environment to enable this feature.",
          },
        },
        { status: 503 },
      );
    }
    const internalMessage =
      e instanceof RunwareApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Logo generation failed unexpectedly";
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: internalMessage.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    const isProd = process.env.NODE_ENV === "production";
    const clientMessage = isProd
      ? "Logo generation could not be completed. Please try again shortly."
      : internalMessage;
    return NextResponse.json(
      {
        ok: false,
        error: { code: "logo_generation_error", message: clientMessage },
      },
      { status: 502 },
    );
  }
}
