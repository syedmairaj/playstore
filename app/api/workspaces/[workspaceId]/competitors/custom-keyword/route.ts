import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { captureKeywordAsoBaselineIfUnset } from "@/lib/keywords/capture-aso-baseline";
import {
  buildInsufficientAiCreditsPayload,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import {
  SerperNotConfiguredError,
  isSerperConfigured,
  searchPlayStore,
  type SerperPlayStoreCountryResult,
} from "@/lib/serper";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { normalizeCountries } from "@/lib/serper";

const ROUTE = "POST /api/workspaces/[workspaceId]/competitors/custom-keyword";
const CREDIT_COST = AI_CREDIT_COSTS.serper_preview_per_country; // 1 credit

const bodySchema = z.object({
  /** UUID of the workspace app whose package we track as "your" rank. */
  appId: z.string().uuid(),
  /** Play Store package ID of the competitor (e.g. "com.competitor.app"). */
  competitorPackageId: z.string().min(2).max(200),
  /** Keyword to search for. */
  keyword: z.string().min(2).max(160).transform((s) => s.trim()),
  /** Single market code (e.g. "us", "sa"). */
  country: z.string().min(2).max(4).transform((s) => s.trim().toLowerCase()),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * Resolves the 1-indexed organic rank for `packageId` in a Serper result set.
 * Returns SERPER_RANK_NOT_IN_FIRST_PAGE when the package is not found.
 */
function resolveRank(
  result: SerperPlayStoreCountryResult,
  packageId: string,
): number {
  if (!packageId || result.error) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  const pkg = packageId.trim().toLowerCase();
  const item = result.items.find(
    (i) => i.packageId?.trim().toLowerCase() === pkg,
  );
  return item ? item.position : SERPER_RANK_NOT_IN_FIRST_PAGE;
}

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(rawBody);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  // ── Validate country ────────────────────────────────────────────────────────
  const countries = normalizeCountries([parsed.country]);
  if (countries.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_country", message: `Unsupported country: ${parsed.country}` } },
      { status: 400 },
    );
  }
  const country = countries[0]!;

  // ── Validate workspace app + fetch its package_name ─────────────────────────
  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id, package_name")
    .eq("id", parsed.appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appErr || !appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_app", message: "App not found in this workspace." } },
      { status: 400 },
    );
  }

  const workspacePackage = String(appRow.package_name ?? "").trim().toLowerCase();
  if (!workspacePackage) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message:
            "Add this app's Android package name in workspace settings before checking live ranks.",
        },
      },
      { status: 400 },
    );
  }

  // ── Serper availability check ───────────────────────────────────────────────
  if (!isSerperConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "serper_not_configured",
          message: "Live rank lookup is not enabled on this server.",
        },
      },
      { status: 503 },
    );
  }

  // ── Credit pre-flight ───────────────────────────────────────────────────────
  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not read AI credit balance. Try again shortly." } },
      { status: 503 },
    );
  }
  if (balancePre.remaining < CREDIT_COST) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(CREDIT_COST, balancePre.remaining),
      { status: 402 },
    );
  }

  // ── Consume credit before external call ────────────────────────────────────
  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: CREDIT_COST,
    description: "competitor_custom_keyword_rank",
    sourceType: "generation",
    meta: {
      route: ROUTE,
      keyword: parsed.keyword,
      country,
      app_id: parsed.appId,
      competitor_package_id: parsed.competitorPackageId,
    },
  });

  if (!debit.ok) {
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(debit.required ?? CREDIT_COST, debit.remaining ?? 0),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not reserve credits. Try again shortly." } },
      { status: 503 },
    );
  }

  const ledgerId = debit.ledgerId;

  // ── Live Serper search ──────────────────────────────────────────────────────
  let results: SerperPlayStoreCountryResult[];
  try {
    results = await searchPlayStore(parsed.keyword, [country], {
      restrictToPlayStore: true,
      num: 100,
    });
  } catch (e) {
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "competitor_custom_keyword_serper_failed",
    });
    if (e instanceof SerperNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: { code: "serper_not_configured", message: "Live rank lookup is not enabled on this server." } },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "search_error", message: "Unable to fetch live ranks right now. Please try again." } },
      { status: 502 },
    );
  }

  const countryResult = results[0];
  if (!countryResult) {
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "competitor_custom_keyword_no_result",
    });
    return NextResponse.json(
      { ok: false, error: { code: "search_error", message: "No search results returned." } },
      { status: 502 },
    );
  }

  // ── Resolve ranks for both apps ─────────────────────────────────────────────
  const yourRank = resolveRank(countryResult, workspacePackage);
  const competitorPkg = parsed.competitorPackageId.trim().toLowerCase();
  const theirRank = resolveRank(countryResult, competitorPkg);

  // ── Persist the workspace keyword + initial rank snapshot ───────────────────
  // Create (or reuse) keyword row for this app+term.
  let keywordId: string | null = null;

  const { data: existingKw } = await supabase
    .from("keywords")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("app_id", parsed.appId)
    .ilike("term", parsed.keyword)
    .maybeSingle();

  if (existingKw?.id) {
    keywordId = existingKw.id as string;
  } else {
    const { data: newKw, error: kwInsertErr } = await supabase
      .from("keywords")
      .insert({
        workspace_id: workspaceId,
        app_id: parsed.appId,
        term: parsed.keyword,
        market: country,
        locale: country === "sa" || country === "ae" ? "ar" : "en-US",
      })
      .select("id")
      .single();

    if (kwInsertErr || !newKw) {
      // Duplicate on race condition — try to find the existing row
      if (kwInsertErr?.code === "23505") {
        const { data: raceKw } = await supabase
          .from("keywords")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("app_id", parsed.appId)
          .ilike("term", parsed.keyword)
          .maybeSingle();
        keywordId = raceKw?.id as string | null ?? null;
      }
    } else {
      keywordId = newKw.id as string;
    }
  }

  // Insert rank snapshot when we have a keyword row.
  if (keywordId) {
    const snapshotAt = new Date().toISOString();
    await supabase.from("keyword_rank_snapshots").insert({
      keyword_id: keywordId,
      rank: yourRank,
      source: "serper",
      country_code: country,
      snapshot_at: snapshotAt,
    });
    await captureKeywordAsoBaselineIfUnset(supabase, {
      keywordId,
      candidateRank: yourRank < SERPER_RANK_NOT_IN_FIRST_PAGE ? yourRank : null,
      source: "initial_save",
    });
  }

  // ── Persist into competitor analysis_json.shared for reload survival ────────
  // Merge the new custom entry into the competitor's workspace_competitor_analyses
  // row so it survives F5 via GET /competitors.
  const newCustomEntry = {
    keyword: parsed.keyword,
    yourRank: yourRank < SERPER_RANK_NOT_IN_FIRST_PAGE ? yourRank : null,
    theirRank: theirRank < SERPER_RANK_NOT_IN_FIRST_PAGE ? theirRank : SERPER_RANK_NOT_IN_FIRST_PAGE,
    isCustom: true,
    country,
  };

  try {
    const { data: compRow, error: compFetchErr } = await supabase
      .from("workspace_competitor_analyses")
      .select("id, analysis_json")
      .eq("workspace_id", workspaceId)
      .eq("competitor_package_id", competitorPkg)
      .maybeSingle();

    if (compFetchErr) {
      console.error(`[${ROUTE}] fetch competitor row failed:`, compFetchErr.message);
    }

    if (compRow?.id) {
      // Row exists — merge the new entry into the existing shared array.
      const existing = compRow.analysis_json as Record<string, unknown> | null;
      const existingShared: Array<Record<string, unknown>> = Array.isArray(existing?.shared)
        ? (existing.shared as Array<Record<string, unknown>>)
        : [];

      const kwKey = parsed.keyword.trim().toLowerCase();
      const mergedShared = [
        ...existingShared.filter(
          (s) =>
            !(
              typeof s.keyword === "string" &&
              s.keyword.trim().toLowerCase() === kwKey &&
              (s.country === country || s.country == null)
            ),
        ),
        newCustomEntry,
      ];

      const { error: updateErr } = await supabase
        .from("workspace_competitor_analyses")
        .update({
          analysis_json: { ...(existing ?? {}), shared: mergedShared },
          updated_at: new Date().toISOString(),
        })
        .eq("id", compRow.id);

      if (updateErr) {
        console.error(`[${ROUTE}] update analysis_json failed:`, updateErr.message);
      } else {
        console.log(`[${ROUTE}] persisted custom keyword "${parsed.keyword}" to row ${compRow.id}`);
      }
    } else {
      // No competitor row yet — create a minimal one so the custom keyword survives F5.
      const minimalAnalysis = {
        query: competitorPkg,
        topKeywords: [],
        shared: [newCustomEntry],
        quickWins: [],
        quickWinPlans: [],
        quickWinTerms: [],
        gaps: [],
      };
      const { error: insertErr } = await supabase
        .from("workspace_competitor_analyses")
        .insert({
          workspace_id: workspaceId,
          competitor_package_id: competitorPkg,
          competitor_name: competitorPkg,
          analysis_json: minimalAnalysis,
          countries: [country],
          analyzed_at: new Date().toISOString(),
          created_by: user.id,
          updated_at: new Date().toISOString(),
        });

      if (insertErr) {
        // May be a duplicate race — try to update instead.
        if (insertErr.code === "23505") {
          const { data: raceRow } = await supabase
            .from("workspace_competitor_analyses")
            .select("id, analysis_json")
            .eq("workspace_id", workspaceId)
            .eq("competitor_package_id", competitorPkg)
            .maybeSingle();
          if (raceRow?.id) {
            const existing = raceRow.analysis_json as Record<string, unknown> | null;
            const existingShared: Array<Record<string, unknown>> = Array.isArray(existing?.shared)
              ? (existing.shared as Array<Record<string, unknown>>)
              : [];
            const kwKey = parsed.keyword.trim().toLowerCase();
            const mergedShared = [
              ...existingShared.filter(
                (s) =>
                  !(typeof s.keyword === "string" && s.keyword.trim().toLowerCase() === kwKey),
              ),
              newCustomEntry,
            ];
            await supabase
              .from("workspace_competitor_analyses")
              .update({
                analysis_json: { ...(existing ?? {}), shared: mergedShared },
                updated_at: new Date().toISOString(),
              })
              .eq("id", raceRow.id);
          }
        } else {
          console.error(`[${ROUTE}] insert minimal competitor row failed:`, insertErr.message);
        }
      } else {
        console.log(`[${ROUTE}] created minimal competitor row for "${competitorPkg}" with custom keyword "${parsed.keyword}"`);
      }
    }
  } catch (e) {
    console.error(`[${ROUTE}] unexpected error persisting custom keyword:`, e);
  }

  return NextResponse.json({
    ok: true,
    keyword: parsed.keyword,
    country,
    yourRank,
    theirRank,
    keywordId,
    autoTracked: keywordId !== null,
    creditsCharged: CREDIT_COST,
    creditsRemaining: debit.balanceAfter,
  });
}

// ── DELETE — remove a custom keyword from both the tracker and overlap snapshot ──────────────
// Body: { appId, competitorPackageId, keyword, country }
const deleteBodySchema = z.object({
  appId: z.string().uuid(),
  competitorPackageId: z.string().min(2).max(200),
  keyword: z.string().min(1).max(160).transform((s) => s.trim()),
  country: z.string().min(2).max(4).transform((s) => s.trim().toLowerCase()),
});

export async function DELETE(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  let parsed: z.infer<typeof deleteBodySchema>;
  try {
    parsed = deleteBodySchema.parse(rawBody);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input" } },
        { status: 400 },
      );
    }
    throw e;
  }

  const competitorPkg = parsed.competitorPackageId.trim().toLowerCase();
  const kwLower = parsed.keyword.toLowerCase();

  // 1. Remove from analysis_json.shared (prune the isCustom entry).
  try {
    const { data: compRow } = await supabase
      .from("workspace_competitor_analyses")
      .select("id, analysis_json")
      .eq("workspace_id", workspaceId)
      .eq("competitor_package_id", competitorPkg)
      .maybeSingle();

    if (compRow?.id) {
      const existing = compRow.analysis_json as Record<string, unknown> | null;
      const existingShared: Array<Record<string, unknown>> = Array.isArray(existing?.shared)
        ? (existing.shared as Array<Record<string, unknown>>)
        : [];

      const pruned = existingShared.filter(
        (s) =>
          !(
            s.isCustom === true &&
            typeof s.keyword === "string" &&
            s.keyword.trim().toLowerCase() === kwLower &&
            (s.country === parsed.country || s.country == null)
          ),
      );

      await supabase
        .from("workspace_competitor_analyses")
        .update({
          analysis_json: { ...(existing ?? {}), shared: pruned },
          updated_at: new Date().toISOString(),
        })
        .eq("id", compRow.id);
    }
  } catch (e) {
    console.error("[DELETE custom-keyword] failed to prune analysis_json:", e);
  }

  // 2. Delete from keywords table (this cascades snapshots via FK or RLS).
  const { data: kwRow } = await supabase
    .from("keywords")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("app_id", parsed.appId)
    .ilike("term", parsed.keyword)
    .maybeSingle();

  if (kwRow?.id) {
    await supabase.from("keywords").delete().eq("id", kwRow.id);
  }

  return NextResponse.json({ ok: true, keyword: parsed.keyword, country: parsed.country });
}
