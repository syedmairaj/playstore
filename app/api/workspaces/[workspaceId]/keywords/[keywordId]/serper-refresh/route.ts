import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildInsufficientAiCreditsPayload,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import { serperAiCreditsForCountryCount } from "@/lib/keywords/keyword-track-ai-pricing";
import { captureKeywordAsoBaselineIfUnset } from "@/lib/keywords/capture-aso-baseline";
import { maybeCreateAsoRankImprovementAlert } from "@/lib/keywords/evaluate-aso-improvement-alert";
import { maybeCreateRankAlerts } from "@/lib/keywords/evaluate-alerts";
import {
  formatTrackedCompetitorRankForDb,
  resolveTrackedCompetitorRankInSerp,
  summarizeTrackedCompetitorResolution,
  type TrackedCompetitorRef,
} from "@/lib/keywords/tracked-competitor-ranks";
import {
  resolveRankInCountryForSerperSnapshot,
  rankForClientDisplay,
  rankForSnapshotInsert,
  serperCountriesForKeywordRefresh,
} from "@/lib/keywords/serper-snapshot-rank";
import { normPkgForSerperSnapshot } from "@/lib/keywords/serper-snapshot-rank-resolve";
import {
  SerperNotConfiguredError,
  isSerperConfigured,
  searchPlayStore,
  type SerperPlayStoreCountryResult,
} from "@/lib/serper";
import { logAdminAiTransaction } from "@/lib/admin/log-ai-transaction";
import { getWorkspaceRole } from "@/lib/workspace/membership";

// ─────────────────────────────────────────────────────────────────────────────
// Dual-competitor rank resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the best organic Play Store rank for `competitorPkg` in country `cc`
 * from the Serper results array.
 *
 * Design notes:
 *   - Both the tracked package and every result item package are normalised through
 *     `normPkgForSerperSnapshot` / `effectiveSerperPreviewItemPackage` which trim,
 *     decode percent-encoding, and lowercase — preventing space/case mismatches from
 *     DB-stored values vs Serper API payload strings.
 *   - The loop NEVER breaks early: all items are scanned so the best (lowest)
 *     organic position across any alias variant of the package is captured.
 *   - Used symmetrically for competitor slot 1 AND competitor slot 2 — no divergence.
 *
 * Returns:
 *   - A numeric string e.g. `"7"` when the app appears in the first 100 results.
 *   - `"100+"` when the package is NOT found in the top 100 (clean UI badge).
 *   - `null`   when `competitorPkg` is empty / null (slot is unused — writes NULL).
 */
function resolveCompetitorRankString(
  results: SerperPlayStoreCountryResult[],
  competitorPkg: string | null | undefined,
  competitorName: string | null | undefined,
  cc: string,
): string | null {
  if (!normPkgForSerperSnapshot(competitorPkg)) return null;
  return formatTrackedCompetitorRankForDb(
    resolveTrackedCompetitorRankInSerp(results, competitorPkg, cc, competitorName),
  );
}

const ROUTE = "POST /api/workspaces/[workspaceId]/keywords/[keywordId]/serper-refresh";

type Ctx = { params: Promise<{ workspaceId: string; keywordId: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { workspaceId, keywordId } = await context.params;
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

  if (!isSerperConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "serper_not_configured",
          message:
            "Live Play Store search is not configured on this server. Set SERPER_API_KEY to enable it.",
        },
      },
      { status: 503 },
    );
  }

  const { data: keyword, error: kwErr } = await supabase
    .from("keywords")
    .select("id,term,market,app_id")
    .eq("id", keywordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (kwErr || !keyword) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Keyword not found" } },
      { status: 404 },
    );
  }

  const appId = keyword.app_id as string | null;
  if (!appId) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "no_app", message: "This keyword is not linked to an app." },
      },
      { status: 400 },
    );
  }

  const { data: appRow, error: appErr } = await supabase
    .from("apps")
    .select("id,package_name,name,target_countries")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appErr || !appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_app", message: "App not found." } },
      { status: 400 },
    );
  }

  const pkg = String(appRow.package_name ?? "").trim();
  const appDisplayName =
    typeof appRow.name === "string" && appRow.name.trim() ? appRow.name.trim() : null;
  if (!pkg) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message: "Add this app’s Android package name in workspace settings before refreshing ranks.",
        },
      },
      { status: 400 },
    );
  }

  const { data: snapCodeRows } = await supabase
    .from("keyword_rank_snapshots")
    .select("country_code")
    .eq("keyword_id", keywordId)
    .not("country_code", "is", null);

  const snapshotCountryCodes = [
    ...new Set(
      (snapCodeRows ?? [])
        .map((r) => String(r.country_code ?? "").trim().toLowerCase())
        .filter((c) => c.length > 0),
    ),
  ];

  const countries = serperCountriesForKeywordRefresh({
    keywordMarket: String(keyword.market ?? "us"),
    targetCountries: appRow.target_countries as string[] | null | undefined,
    snapshotCountryCodes: snapshotCountryCodes.length > 0 ? snapshotCountryCodes : null,
  });

  const creditCost = serperAiCreditsForCountryCount(countries.length);

  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
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
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balancePre.remaining),
      { status: 402 },
    );
  }

  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: "serper_keyword_refresh",
    sourceType: "generation",
    meta: {
      route: ROUTE,
      keyword_id: keywordId,
      countries,
    },
  });

  if (!debit.ok) {
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(
          debit.required ?? creditCost,
          debit.remaining ?? 0,
        ),
        { status: 402 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "wallet_error", message: "Could not reserve credits. Try again shortly." },
      },
      { status: 503 },
    );
  }

  const ledgerId = debit.ledgerId;

  // ── Query the workspace's 2 active competitor slots ────────────────────────
  // Pulled BEFORE the credit debit so the snapshot rows include competitor ranks
  // without any additional billing cost. Ordered by analyzed_at desc so the most
  // recently analysed competitor occupies slot 1.
  const { data: competitorRows } = await supabase
    .from("workspace_competitor_analyses")
    .select("competitor_package_id,competitor_name")
    .eq("workspace_id", workspaceId)
    .order("analyzed_at", { ascending: false })
    .limit(2);

  const comp1Pkg: string | null =
    (competitorRows?.[0]?.competitor_package_id as string | undefined) ?? null;
  const comp1Name: string | null =
    (competitorRows?.[0]?.competitor_name as string | undefined) ?? null;
  const comp2Pkg: string | null =
    (competitorRows?.[1]?.competitor_package_id as string | undefined) ?? null;
  const comp2Name: string | null =
    (competitorRows?.[1]?.competitor_name as string | undefined) ?? null;

  try {
    const snapshotAt = new Date().toISOString();
    // Live Serper only (searchPlayStore uses cache: "no-store"). Deep organic slice for refresh;
    // billing remains serper_preview_per_country × countries (see keyword-track-ai-pricing).
    const trackedCompetitorRefs: TrackedCompetitorRef[] = [
      ...(comp1Pkg ? [{ package_name: comp1Pkg, name: comp1Name }] : []),
      ...(comp2Pkg ? [{ package_name: comp2Pkg, name: comp2Name }] : []),
    ];

    // Play-focused query (same as Competitor Spy) — generic Google SERP often
    // returns only 1–2 play.google.com links and misses tracked competitors.
    const results = await searchPlayStore(String(keyword.term ?? "").trim(), countries, {
      num: 100,
      restrictToPlayStore: true,
    });
    const mkt = String(keyword.market ?? "us").trim().toLowerCase() || "us";

    const { data: prevRows } = await supabase
      .from("keyword_rank_snapshots")
      .select("rank,snapshot_at,country_code")
      .eq("keyword_id", keywordId)
      .or(`country_code.is.null,country_code.eq.${mkt}`)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    const prevRank =
      prevRows && prevRows.length > 0 ? (prevRows[0].rank as number | null) : null;

    // Build one snapshot row per country.
    // competitor_1_rank / competitor_2_rank: numeric string ("7") or "100+" when not
    // found; null when the competitor slot is empty (keeps the column sparse / NULL).
    for (const cc of countries) {
      const trackedLog = summarizeTrackedCompetitorResolution(
        trackedCompetitorRefs,
        results,
        cc,
      );
      console.log(`[${ROUTE}] tracked competitors (user-selected only)`, {
        keyword: keyword.term,
        country: cc,
        yourPackage: pkg,
        serpPlayAppCount: trackedLog.serp_play_app_count,
        competitors: trackedLog.competitors,
      });
    }

    const rankOptions = { displayName: appDisplayName };
    const rows = countries.map((cc) => {
      const rawRank = resolveRankInCountryForSerperSnapshot(results, pkg, cc, rankOptions);
      return {
        keyword_id: keywordId,
        rank: rankForSnapshotInsert(rawRank),
        source: "serper" as const,
        country_code: cc,
        snapshot_at: snapshotAt,
        competitor_1_package: comp1Pkg ?? null,
        competitor_1_rank: resolveCompetitorRankString(results, comp1Pkg, comp1Name, cc),
        competitor_2_package: comp2Pkg ?? null,
        competitor_2_rank: resolveCompetitorRankString(results, comp2Pkg, comp2Name, cc),
      };
    });

    const primaryRankRaw = resolveRankInCountryForSerperSnapshot(results, pkg, mkt, rankOptions);
    const primaryRankDb = rankForSnapshotInsert(primaryRankRaw);
    const primaryRankClient = rankForClientDisplay(primaryRankRaw);

    const snapSelect =
      "id,rank,snapshot_at,best_rank,source,country_code,competitor_1_package,competitor_1_rank,competitor_2_package,competitor_2_rank";

    const { data: snaps, error: snapErr } = await supabase
      .from("keyword_rank_snapshots")
      .insert(rows)
      .select(snapSelect);

    if (snapErr || !snaps?.length) {
      throw new Error(snapErr?.message ?? "snapshot_insert_failed");
    }

    const primarySnap =
      snaps.find((s) => String(s.country_code ?? "").trim().toLowerCase() === mkt) ??
      snaps[0];

    await maybeCreateRankAlerts({
      supabase,
      workspaceId,
      keywordId,
      keywordTerm: String(keyword.term ?? ""),
      prevRank: rankForClientDisplay(prevRank),
      newRank: primaryRankClient,
    });

    await captureKeywordAsoBaselineIfUnset(supabase, {
      keywordId,
      candidateRank: primaryRankDb,
      source: "initial_save",
    });

    await maybeCreateAsoRankImprovementAlert({
      supabase,
      workspaceId,
      keywordId,
      keywordTerm: String(keyword.term ?? ""),
      newPrimaryRank: primaryRankClient,
    });

    void logAdminAiTransaction({
      providerService: "serper",
      userId: user.id,
      workspaceId,
      featureSlug: "serper_keyword_refresh",
      totalQueriesRun: countries.length,
      creditsCharged: creditCost,
    });

    return NextResponse.json({
      ok: true,
      rank: rankForClientDisplay(primarySnap.rank as number),
      snapshotAt: primarySnap.snapshot_at,
      creditsCharged: creditCost,
      countries,
      // Surface competitor ranks to the client so the optimistic table patch
      // can immediately display fresh competitor badges without a re-fetch.
      competitor1: comp1Pkg
        ? {
            packageId: comp1Pkg,
            rank: primarySnap.competitor_1_rank as string | null ?? null,
          }
        : null,
      competitor2: comp2Pkg
        ? {
            packageId: comp2Pkg,
            rank: primarySnap.competitor_2_rank as string | null ?? null,
          }
        : null,
    });
  } catch (e) {
    const refund = await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "serper_keyword_refresh_failed",
    });
    if (!refund.ok) {
      console.error(`[${ROUTE}] refund_failed`, refund.code, { ledgerId });
    }

    if (e instanceof SerperNotConfiguredError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "serper_not_configured",
            message: "Live Play Store search is not configured on this server.",
          },
        },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : "Search failed";
    console.error(`[${ROUTE}]`, msg);
    return NextResponse.json(
      { ok: false, error: { code: "search_error", message: msg } },
      { status: 502 },
    );
  }
}
