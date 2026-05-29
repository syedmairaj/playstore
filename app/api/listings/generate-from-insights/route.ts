/**
 * POST /api/listings/generate-from-insights
 *
 * Fully automated listing generation pipeline — no human prompt required.
 *
 * The pipeline:
 *   1. Load workspace app metadata (name, category, package_name)
 *   2. Load tracked keywords for that app (becomes targetKeywords)
 *   3. Load active (non-implemented) backlog items for the app → exploit targets
 *   4. If no backlog items, load competitor_insights from DB as fallback
 *   5. Pass everything to generatePainPointListing() — Gemini does the rest
 *   6. Persist to listing_generations, deduct credits, return result
 *
 * This is the SaaS-grade automated path: one HTTP call from the UI kicks off
 * a full competitive-displacement generation with zero manual prompt filling.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { generatePainPointListing } from "@/lib/gemini/generate-pain-point-listing";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import { resolveGeminiModel } from "@/lib/gemini/gemini-defaults";
import { getListingOptimizerPromptVersion } from "@/lib/prompts/listing-optimizer";
import { insertListingGeneration } from "@/lib/db/listing-generations";
import { logAdminAiTransaction } from "@/lib/admin/log-ai-transaction";
import { logUsage } from "@/lib/usage-log";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import {
  acquireGenerationLock,
  releaseGenerationLock,
} from "@/lib/server/generation-idempotency-lock";
import { shouldLogGeminiDebug } from "@/lib/gemini/log-gemini-env";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";
import type { ToneStyle } from "@/lib/types/listing";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE      = "POST /api/listings/generate-from-insights";
const LOCK_ACTION = "listing_generate"; // shares lock namespace with manual generate

// ─────────────────────────────────────────────────────────────────────────────
// Request schema
// ─────────────────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  /** The workspace app to generate for. */
  appId: z.string().uuid(),
  /**
   * Copy tone — defaults to "professional" if omitted.
   * The UI can expose this as a simple dropdown; the pipeline handles the rest.
   */
  toneStyle: z.enum(["professional", "friendly", "bold", "minimal"]).optional().default("professional"),
  /**
   * When true, model returns Arabic copy for all user-visible strings.
   * Mirrors the targetArabic flag in the manual listing optimizer.
   */
  targetArabic: z.boolean().optional().default(false),
});

type Body = z.infer<typeof bodySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the workspace app row — name, category (from metadata), package_name.
 * Returns null when the app doesn't exist or belongs to a different workspace.
 */
async function fetchApp(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  workspaceId: string,
  appId: string,
): Promise<{ name: string; category: string; packageName: string } | null> {
  const { data, error } = await supabase
    .from("apps")
    .select("id, name, package_name, metadata")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;

  // category is stored inside the metadata JSONB column
  const meta = data.metadata && typeof data.metadata === "object"
    ? (data.metadata as Record<string, unknown>)
    : {};
  const category = typeof meta.category === "string" && meta.category.trim()
    ? meta.category.trim()
    : "Android App";

  return {
    name:        (data.name as string) ?? "My App",
    category,
    packageName: (data.package_name as string) ?? "",
  };
}

/**
 * Fetches tracked keyword terms for an app.
 * Returns an empty array when no keywords are tracked yet.
 * Falls back gracefully — the listing prompt works fine with an empty list.
 */
async function fetchKeywords(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  appId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("keywords")
    .select("term")
    .eq("app_id", appId)
    .order("best_rank", { ascending: true, nullsFirst: false })
    .limit(25);

  if (error || !data) return [];
  return data.map((r: { term: string }) => r.term).filter(Boolean);
}

/**
 * Fetches active (non-implemented) backlog items for a workspace.
 * These are the pain points the user has explicitly staged for exploitation —
 * the highest-quality exploit signal because the user validated them.
 */
async function fetchActiveBacklogIssues(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  workspaceId: string,
): Promise<IssueItem[]> {
  const { data, error } = await supabase
    .from("workspace_listing_backlog")
    .select("issue_title, issue_description, severity, impact")
    .eq("workspace_id", workspaceId)
    .eq("is_implemented", false)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) return [];

  return data.map((row: {
    issue_title: string;
    issue_description: string;
    severity: "CRITICAL" | "MEDIUM" | "LOW";
    impact: number;
  }) => ({
    title:       row.issue_title,
    description: row.issue_description,
    severity:    row.severity,
    impact:      row.impact,
    quote:       "",
  }));
}

/**
 * Fallback: fetches competitor_insights for the workspace's own package + country.
 * Used when no backlog items are staged yet — surfaces issues the user hasn't
 * acted on but which are still real competitive signals.
 */
async function fetchCompetitorInsights(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  workspaceId: string,
  packageName: string,
): Promise<IssueItem[]> {
  if (!packageName) return [];

  const { data, error } = await supabase
    .from("competitor_insights")
    .select("insights, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("package_name", packageName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !Array.isArray(data.insights)) return [];
  return (data.insights as IssueItem[]).slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const started  = Date.now();
  const clientIp = getClientIp(request);

  // ── Admin client (for rate-limit + usage logging) ────────────────────────
  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "config", message: e instanceof Error ? e.message : "Configuration error" } },
      { status: 503 },
    );
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input: Body;
  try {
    input = bodySchema.parse(rawBody);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  const { workspaceId, appId, toneStyle, targetArabic } = input;

  // ── Workspace membership ─────────────────────────────────────────────────
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  // ── Idempotency lock — prevent double-click / network-retry double charge ─
  if (!acquireGenerationLock(workspaceId, LOCK_ACTION)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "duplicate_request",
          message: "A generation is already in progress. Please wait a moment.",
        },
      },
      { status: 429 },
    );
  }

  // ── All paths past the lock MUST release it ───────────────────────────────
  const model         = resolveGeminiModel();
  const promptVersion = getListingOptimizerPromptVersion();
  const creditCost    = AI_CREDIT_COSTS.listing_generation;

  // ── Pre-flight credit check ───────────────────────────────────────────────
  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not read AI credit balance." } },
      { status: 503 },
    );
  }
  if (balancePre.remaining < creditCost) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balancePre.remaining),
      { status: 402 },
    );
  }

  // ── Load all pipeline inputs from DB (fully automated — no user prompting) ─
  //
  // Step 1: App metadata
  const app = await fetchApp(admin, workspaceId, appId);
  if (!app) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    return NextResponse.json(
      { ok: false, error: { code: "invalid_app", message: "App not found in this workspace." } },
      { status: 400 },
    );
  }

  // Step 2: Tracked keywords → targetKeywords for the listing prompt
  const targetKeywords = await fetchKeywords(admin, appId);

  // Step 3: Active backlog issues → exploit targets (user-validated pain points)
  let issues = await fetchActiveBacklogIssues(admin, workspaceId);

  // Step 4: If no staged backlog items, fall back to competitor_insights
  if (issues.length === 0 && app.packageName) {
    issues = await fetchCompetitorInsights(admin, workspaceId, app.packageName);
  }

  if (shouldLogGeminiDebug()) {
    console.log(`[${ROUTE}] app: ${app.name}, keywords: ${targetKeywords.length}, issues: ${issues.length}`);
    console.log(`[${ROUTE}] exploit targets:`, issues.map(i => i.title));
  }

  // ── Deduct credits ────────────────────────────────────────────────────────
  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId:      user.id,
    amount:      creditCost,
    description: `Auto listing generation from insights: ${app.name}`,
    sourceType:  "generation",
    meta:        { route: ROUTE, tool: "aso_listing_auto", model },
  });

  if (!debit.ok) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(debit.required ?? creditCost, debit.remaining ?? 0),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not reserve credits." } },
      { status: 503 },
    );
  }

  const ledgerId = debit.ledgerId;

  // ── Call the automated pipeline ───────────────────────────────────────────
  try {
    const { data, asoScorePartial, retried } = await generatePainPointListing({
      appName:        app.name,
      category:       app.category,
      targetKeywords: targetKeywords.length > 0 ? targetKeywords : [app.name],
      // appFeatures: derive a lean brief from what we know — the displacement
      // campaign in the prompt will dominate the copy direction anyway.
      appFeatures:    `${app.name} — ${app.category} app. Optimized for Google Play Store.`,
      issues,
      toneStyle:      toneStyle as ToneStyle,
      targetArabic,
    });

    // ── Persist generation ──────────────────────────────────────────────────
    const persist = await insertListingGeneration(supabase, {
      input: {
        appName:        app.name,
        category:       app.category,
        targetKeywords: targetKeywords.length > 0 ? targetKeywords : [app.name],
        appFeatures:    `${app.name} — ${app.category} app.`,
        toneStyle:      toneStyle as ToneStyle,
        targetArabic,
        exploitTargets: issues.map(i => i.title),
      },
      output:        data,
      clientIp,
      model,
      promptVersion,
      workspaceId,
      userId:        user.id,
      creditsLedgerId: ledgerId,
      appId,
    });

    // ── COGS tracking ───────────────────────────────────────────────────────
    void logAdminAiTransaction({
      userId:          user.id,
      workspaceId,
      featureSlug:     "listing_generation",
      providerService: "gemini",
      usage:           null,
      creditsCharged:  creditCost,
    });

    await logUsage(admin, {
      route:      ROUTE,
      clientIp,
      success:    true,
      durationMs: Date.now() - started,
      meta: {
        user_id:       user.id,
        workspace_id:  workspaceId,
        app_id:        appId,
        issues_count:  issues.length,
        keywords_count: targetKeywords.length,
        persisted:     persist.ok,
      },
    });

    releaseGenerationLock(workspaceId, LOCK_ACTION);

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        model,
        promptVersion,
        persisted:       persist.ok,
        generationId:    persist.ok ? persist.id : undefined,
        savedAt:         persist.ok ? persist.createdAt : undefined,
        asoScorePartial: asoScorePartial ? true : undefined,
        retried:         retried ? true : undefined,
        /** How many pain points were auto-wired into the displacement campaign. */
        exploitCount:    issues.length,
        exploitTitles:   issues.map(i => i.title),
      },
    });
  } catch (e) {
    // ── Refund on failure ───────────────────────────────────────────────────
    if (ledgerId) {
      await refundWorkspaceAiCredits(supabase, {
        ledgerId,
        userId: user.id,
        reason: "Auto listing generation failed before a saved result",
      });
    }

    releaseGenerationLock(workspaceId, LOCK_ACTION);

    const internalMessage = e instanceof Error ? e.message : "Generation failed";

    await logUsage(admin, {
      route:      ROUTE,
      clientIp,
      success:    false,
      durationMs: Date.now() - started,
      errorMessage: internalMessage.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });

    if (e instanceof InvalidModelOutputError) {
      return NextResponse.json(
        { ok: false, error: { code: "invalid_model_output", message: e.message } },
        { status: 422 },
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code:    "generation_error",
          message: isProd
            ? "Auto-generation could not be completed. Please try again."
            : internalMessage,
        },
      },
      { status: 500 },
    );
  }
}
