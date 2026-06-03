/**
 * POST /api/screenshot-studio/captions
 *
 * Calls Gemini to generate 3 caption variation sets (feature-led, benefit-led,
 * emotional-led) for the first 3 Play Store screenshots.
 *
 * Also pulls the latest Listing Optimizer output for the selected app so the
 * captions are contextually grounded in the user's optimized title + features.
 *
 * Cost: AI_CREDIT_COSTS.screenshot_captions (3 credits).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getClientIp } from "@/lib/client-ip";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features";
import { logUsage } from "@/lib/usage-log";
import { generateScreenshotCaptions } from "@/lib/gemini/generate-screenshot-captions";
import { loadLatestListingHydrationForApp } from "@/lib/listing/latest-listing-hydration";
import { LISTING_LOGO_STYLES } from "@/lib/validation/listing-logo-generate-body";

const ROUTE = "POST /api/screenshot-studio/captions";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  appId: z.string().uuid(),
  appName: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).default(""),
  shortDescription: z.string().trim().max(2000).optional(),
  style: z.enum(LISTING_LOGO_STYLES),
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  locale: z.enum(["en", "ar"]).default("en"),
}).strict();

export async function POST(request: NextRequest) {
  const started = Date.now();
  const clientIp = getClientIp(request);

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "unconfigured", message: "AI service not configured." } },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthorized", message: "Sign in required." } }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: { code: "bad_request", message: "Invalid JSON body" } }, { status: 400 });
  }

  let input;
  try { input = bodySchema.parse(body); } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } }, { status: 400 });
    }
    throw e;
  }

  const { workspaceId, appId, appName, category, shortDescription, style, brandColor, locale } = input;

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: { code: "forbidden", message: "Workspace not found" } }, { status: 403 });
  }

  const creditCost = AI_CREDIT_COSTS.screenshot_captions;
  const balance = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balance.ok) {
    return NextResponse.json({ ok: false, error: { code: "wallet_error", message: "Could not read AI credit balance." } }, { status: 503 });
  }
  if (balance.remaining < creditCost) {
    return NextResponse.json(buildInsufficientAiCreditsPayload(creditCost, balance.remaining), { status: 402 });
  }

  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId, userId: user.id, amount: creditCost,
    description: "Screenshot Studio — caption generation (Gemini)",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "screenshot_captions", app_id: appId },
  });
  if (!debit.ok) {
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(buildInsufficientAiCreditsPayload(debit.required ?? creditCost, debit.remaining ?? 0), { status: 402 });
    }
    return NextResponse.json({ ok: false, error: { code: "wallet_error", message: "Could not reserve credits." } }, { status: 503 });
  }

  // Pull Listing Optimizer context to ground the captions in optimized copy
  let listingTitle: string | undefined;
  let features: string | undefined;
  try {
    const hydration = await loadLatestListingHydrationForApp(supabase, workspaceId, appId);
    if (hydration) {
      listingTitle = hydration.output?.title ?? undefined;
      // Convert features textarea to clean bullet list
      if (hydration.appFeatures?.trim()) {
        features = hydration.appFeatures.trim();
      }
    }
  } catch { /* non-fatal — captions still generate without listing context */ }

  const admin = getSupabaseAdmin();

  try {
    const result = await generateScreenshotCaptions({
      appName, category, shortDescription, listingTitle, features, style, brandColor, locale,
    });

    await logUsage(admin, {
      route: ROUTE, clientIp, success: true,
      durationMs: Date.now() - started,
      meta: { user_id: user.id, workspace_id: workspaceId, app_id: appId },
    });

    return NextResponse.json({
      ok: true,
      variations: result.variations,
      meta: { creditsCharged: creditCost, creditsRemaining: debit.balanceAfter },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Caption generation failed";
    await logUsage(admin, {
      route: ROUTE, clientIp, success: false,
      durationMs: Date.now() - started,
      errorMessage: message.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    const isProd = process.env.NODE_ENV === "production";
    return NextResponse.json(
      { ok: false, error: { code: "generation_error", message: isProd ? "Caption generation failed. Please try again." : message } },
      { status: 502 },
    );
  }
}
