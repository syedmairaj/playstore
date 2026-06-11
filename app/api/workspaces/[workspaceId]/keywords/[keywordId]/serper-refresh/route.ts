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
  buildTrackedCompetitorRanksMap,
  formatTrackedCompetitorRankForDb,
  resolveConfiguredCompetitorSlot,
  type ResolvedConfiguredCompetitor,
  type TrackedCompetitorRef,
} from "@/lib/keywords/tracked-competitor-ranks";
import {
  applyLiveRankClientPolicy,
  resolveRankInCountryForSerperSnapshot,
  rankForClientDisplay,
  rankForSnapshotInsert,
  serperCountriesForKeywordRefresh,
} from "@/lib/keywords/serper-snapshot-rank";
import {
  buildSerpRankDebugPayload,
  logPoorSerpRankDebug,
  logSerpTargetMatchResult,
  normPkgForSerperSnapshot,
  resolveRankMatchInCountryForSerperSnapshot,
  serpLookupForPackage,
  warnWhenMissingCanonicalPackageId,
} from "@/lib/keywords/serper-snapshot-rank-resolve";
import {
  SerperNotConfiguredError,
  isSerperConfigured,
  searchPlayStore,
  type SerperPlayStoreCountryResult,
} from "@/lib/serper";
import { logAdminAiTransaction } from "@/lib/admin/log-ai-transaction";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  persistAppSerpMatchedPackageId,
  persistCompetitorSerpMatchedPackageId,
} from "@/lib/keywords/persist-serp-matched-package";
import {
  loadAppForSerperRank,
  loadCompetitorsForSerperRank,
} from "@/lib/workspace/load-app-for-serper-rank";

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
function competitorRankStringFromResolved(
  resolved: ResolvedConfiguredCompetitor | null,
): string | null {
  return resolved?.rankText ?? null;
}

function toApiCompetitorPayload(
  resolved: ResolvedConfiguredCompetitor | null,
): Record<string, unknown> | null {
  if (!resolved) return null;
  return {
    slot: resolved.slot,
    packageId: resolved.packageId,
    displayName: resolved.displayName,
    initial: resolved.initial,
    iconUrl: resolved.iconUrl,
    rank: resolved.rankText,
    rankNumeric: resolved.rank,
    matchKind: resolved.matchKind,
    matchScore: resolved.matchScore,
    matchedPackageId: resolved.matchedPackageId ?? null,
    matchedSerpTitle: resolved.matchedSerpTitle ?? null,
  };
}

async function writeKeywordTrackerVaultLiveRanks(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workspaceId: string;
  appId: string;
  userId: string;
  keywordTerm: string;
  locale: "en" | "ar";
  snapshotAt: string;
  marketRanks: Array<{
    country: string;
    rank: number | null;
    not_ranked_reason?: string;
    tracked_competitor_ranks?: Record<string, number | null>;
  }>;
}): Promise<void> {
  const stateKey = args.locale === "ar" ? "state_ar" : "state_en";
  const { data: vaultRow } = await args.supabase
    .from("workspace_staging_vault")
    .select(`id, ${stateKey}, change_count`)
    .eq("workspace_id", args.workspaceId)
    .eq("app_id", args.appId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!vaultRow) return;

  const currentState = (vaultRow[stateKey as keyof typeof vaultRow] ?? {}) as Record<
    string,
    unknown
  >;
  const features = (currentState.features ?? {}) as Record<string, unknown>;
  const kvValidator = (features.keyword_validator ?? {}) as Record<string, unknown>;
  const validatorSignals = (kvValidator.signals ?? {}) as Record<string, unknown>;
  const kwSignal = (validatorSignals[args.keywordTerm] ?? {}) as Record<string, unknown>;
  const existingRanks = (kwSignal.live_ranks ?? {}) as Record<string, unknown>;

  const trackerFeature = (features.keyword_tracker ?? {}) as Record<string, unknown>;
  const trackerSignals = (trackerFeature.signals ?? {}) as Record<string, unknown>;
  const trackerKwSignal = (trackerSignals[args.keywordTerm] ?? {}) as Record<string, unknown>;
  const existingTrackerRanks = (trackerKwSignal.live_ranks ?? {}) as Record<string, unknown>;

  const newRanks: Record<string, unknown> = { ...existingRanks };
  const newTrackerRanks: Record<string, unknown> = { ...existingTrackerRanks };

  for (const entry of args.marketRanks) {
    const payload = {
      rank: entry.rank,
      fetched_at: args.snapshotAt,
      ...(entry.not_ranked_reason ? { not_ranked_reason: entry.not_ranked_reason } : {}),
      ...(entry.tracked_competitor_ranks &&
      Object.keys(entry.tracked_competitor_ranks).length > 0
        ? { tracked_competitor_ranks: entry.tracked_competitor_ranks }
        : {}),
    };
    newRanks[entry.country] = payload;
    newTrackerRanks[entry.country] = payload;
  }

  const updatedState: Record<string, unknown> = {
    ...currentState,
    features: {
      ...features,
      keyword_validator: {
        ...kvValidator,
        signals: {
          ...validatorSignals,
          [args.keywordTerm]: {
            ...kwSignal,
            live_ranks: newRanks,
            last_fetched_at: args.snapshotAt,
          },
        },
      },
      keyword_tracker: {
        ...trackerFeature,
        signals: {
          ...trackerSignals,
          [args.keywordTerm]: {
            ...trackerKwSignal,
            live_ranks: newTrackerRanks,
            last_fetched_at: args.snapshotAt,
          },
        },
      },
    },
  };

  await args.supabase
    .from("workspace_staging_vault")
    .update({
      [stateKey]: updatedState,
      updated_at: args.snapshotAt,
      change_count: ((vaultRow.change_count as number) ?? 0) + 1,
      last_modified_by: args.userId,
    })
    .eq("workspace_id", args.workspaceId)
    .eq("app_id", args.appId);
}

const ROUTE = "POST /api/workspaces/[workspaceId]/keywords/[keywordId]/serper-refresh";

type Ctx = { params: Promise<{ workspaceId: string; keywordId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { workspaceId, keywordId } = await context.params;
  let vaultLocale: "en" | "ar" = "en";
  try {
    const body = (await request.json()) as { locale?: string };
    if (body?.locale === "ar" || body?.locale === "en") vaultLocale = body.locale;
  } catch {
    /* empty body is fine */
  }
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

  const { data: appRow, error: appLoadErr } = await loadAppForSerperRank(
    supabase,
    workspaceId,
    appId,
  );

  if (appLoadErr) {
    console.error(`[${ROUTE}] app_load_failed`, appLoadErr.message);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "app_load_error",
          message: "Could not load app settings. Try again shortly.",
        },
      },
      { status: 503 },
    );
  }

  if (!appRow) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_app", message: "App not found." } },
      { status: 400 },
    );
  }

  const pkg = String(appRow.package_name ?? "").trim();
  const appCanonicalPkg = appRow.canonical_package_id;
  const appSerpMatchedPkg = appRow.serp_matched_package_id;
  const appDisplayName = appRow.name;
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
  const { data: competitorRows, error: competitorLoadErr } =
    await loadCompetitorsForSerperRank(supabase, workspaceId);
  if (competitorLoadErr) {
    console.warn(`[${ROUTE}] competitor_load_failed`, competitorLoadErr.message);
  }

  const comp1Pkg = competitorRows[0]?.competitor_package_id ?? null;
  const comp1Canonical = competitorRows[0]?.canonical_package_id ?? null;
  const comp1SerpMatched = competitorRows[0]?.serp_matched_package_id ?? null;
  const comp1Name = competitorRows[0]?.competitor_name ?? null;
  const comp1Icon = competitorRows[0]?.icon_url ?? null;
  const comp2Pkg = competitorRows[1]?.competitor_package_id ?? null;
  const comp2Canonical = competitorRows[1]?.canonical_package_id ?? null;
  const comp2SerpMatched = competitorRows[1]?.serp_matched_package_id ?? null;
  const comp2Name = competitorRows[1]?.competitor_name ?? null;
  const comp2Icon = competitorRows[1]?.icon_url ?? null;

  try {
    const snapshotAt = new Date().toISOString();
    // Live Serper only (searchPlayStore uses cache: "no-store"). Deep organic slice for refresh;
    // billing remains serper_preview_per_country × countries (see keyword-track-ai-pricing).
    const trackedCompetitorRefs: TrackedCompetitorRef[] = [
      ...(comp1Pkg
        ? [{
            package_name: comp1Pkg,
            canonical_package_id: comp1Canonical,
            serp_matched_package_id: comp1SerpMatched,
            name: comp1Name,
            icon_url: comp1Icon,
          }]
        : []),
      ...(comp2Pkg
        ? [{
            package_name: comp2Pkg,
            canonical_package_id: comp2Canonical,
            serp_matched_package_id: comp2SerpMatched,
            name: comp2Name,
            icon_url: comp2Icon,
          }]
        : []),
    ];

    const missingCanonicalWarned = new Set<string>();

    // Play-focused query (same as Competitor Spy) — generic Google SERP often
    // returns only 1–2 play.google.com links and misses tracked competitors.
    const results = await searchPlayStore(String(keyword.term ?? "").trim(), countries, {
      deepRankSearch: true,
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
      const block = results.find(
        (r) => String(r.country ?? "").trim().toLowerCase() === cc,
      );
      const debugTargets = [
        {
          label: "your_app",
          packageName: pkg,
          canonicalPackageId: appCanonicalPkg,
          serpMatchedPackageId: appSerpMatchedPkg,
          displayName: appDisplayName,
        },
        ...trackedCompetitorRefs.map((c, i) => ({
          label: `competitor_${i + 1}`,
          packageName: c.package_name,
          canonicalPackageId: c.canonical_package_id ?? null,
          serpMatchedPackageId: c.serp_matched_package_id ?? null,
          displayName: c.name ?? null,
        })),
      ];
      const matchDebug = buildSerpRankDebugPayload(block?.items ?? [], debugTargets, {
        serpLimit: 10,
      });
      console.log(`[${ROUTE}] serp match debug`, {
        keyword: keyword.term,
        country: cc,
        serpPlayAppCount: block?.items.length ?? 0,
        topSerp: matchDebug.topSerp,
        matches: matchDebug.matches,
      });
      for (const target of debugTargets) {
        const lookup = serpLookupForPackage(
          target.packageName,
          target.canonicalPackageId,
          target.serpMatchedPackageId,
        );
        if (lookup.lookupSource === "internal" && !missingCanonicalWarned.has(target.label)) {
          missingCanonicalWarned.add(target.label);
          warnWhenMissingCanonicalPackageId(ROUTE, {
            label: target.label,
            internalPackageId: lookup.internalPackageId,
            displayName: target.displayName,
          });
        }
        const match = resolveRankMatchInCountryForSerperSnapshot(
          results,
          target.packageName,
          cc,
          {
            displayName: target.displayName,
            canonicalPackageId: target.canonicalPackageId,
            serpMatchedPackageId: target.serpMatchedPackageId,
            bestEffortTitleMatch: true,
          },
        );
        logSerpTargetMatchResult(
          ROUTE,
          {
            keyword: String(keyword.term ?? ""),
            country: cc,
            label: target.label,
            internalPackageId: lookup.internalPackageId,
            serpLookupPackageId: lookup.serpLookupPackageId,
            usedCanonical: lookup.usedCanonical,
            displayName: target.displayName,
          },
          match,
        );
      }
      if (block?.items?.length) {
        logPoorSerpRankDebug(ROUTE, { keyword: keyword.term, country: cc }, block.items, debugTargets);
      }
    }

    const rankOptions = {
      displayName: appDisplayName,
      canonicalPackageId: appCanonicalPkg,
      serpMatchedPackageId: appSerpMatchedPkg,
      bestEffortTitleMatch: true,
    };
    const comp1Ref = trackedCompetitorRefs[0] ?? null;
    const comp2Ref = trackedCompetitorRefs[1] ?? null;

    const rows = countries.map((cc) => {
      const yourMatch = resolveRankMatchInCountryForSerperSnapshot(
        results,
        pkg,
        cc,
        rankOptions,
      );
      const comp1Resolved = comp1Ref
        ? resolveConfiguredCompetitorSlot(results, "competitor_1", comp1Ref, cc)
        : null;
      const comp2Resolved = comp2Ref
        ? resolveConfiguredCompetitorSlot(results, "competitor_2", comp2Ref, cc)
        : null;
      return {
        keyword_id: keywordId,
        rank: rankForSnapshotInsert(yourMatch.rank),
        rank_match_kind: yourMatch.matchKind,
        source: "serper" as const,
        country_code: cc,
        snapshot_at: snapshotAt,
        competitor_1_package: comp1Pkg ?? null,
        competitor_1_rank: competitorRankStringFromResolved(comp1Resolved),
        competitor_1_match_kind: comp1Resolved?.matchKind ?? null,
        competitor_2_package: comp2Pkg ?? null,
        competitor_2_rank: competitorRankStringFromResolved(comp2Resolved),
        competitor_2_match_kind: comp2Resolved?.matchKind ?? null,
      };
    });

    const primaryMatch = resolveRankMatchInCountryForSerperSnapshot(
      results,
      pkg,
      mkt,
      rankOptions,
    );
    const primaryRankRaw = primaryMatch.rank;
    const primaryRankDb = rankForSnapshotInsert(primaryRankRaw);
    const primaryRankClient = rankForClientDisplay(primaryRankRaw);

    const primaryComp1 = comp1Ref
      ? resolveConfiguredCompetitorSlot(results, "competitor_1", comp1Ref, mkt)
      : null;
    const primaryComp2 = comp2Ref
      ? resolveConfiguredCompetitorSlot(results, "competitor_2", comp2Ref, mkt)
      : null;

    if (
      primaryMatch.matchedPackageId &&
      primaryMatch.matchKind === "title" &&
      !appCanonicalPkg
    ) {
      await persistAppSerpMatchedPackageId(
        supabase,
        workspaceId,
        appId,
        primaryMatch.matchedPackageId,
      );
    }
    if (
      primaryComp1?.matchedPackageId &&
      primaryComp1.matchKind === "title" &&
      comp1Pkg
    ) {
      await persistCompetitorSerpMatchedPackageId(
        supabase,
        workspaceId,
        comp1Pkg,
        primaryComp1.matchedPackageId,
      );
    }
    if (
      primaryComp2?.matchedPackageId &&
      primaryComp2.matchKind === "title" &&
      comp2Pkg
    ) {
      await persistCompetitorSerpMatchedPackageId(
        supabase,
        workspaceId,
        comp2Pkg,
        primaryComp2.matchedPackageId,
      );
    }

    const marketRanks = countries.map((cc) => {
      const rawRank = resolveRankInCountryForSerperSnapshot(results, pkg, cc, rankOptions);
      const { rank: clientRank, not_ranked_reason } = applyLiveRankClientPolicy(rawRank);
      const tracked_competitor_ranks =
        trackedCompetitorRefs.length > 0
          ? buildTrackedCompetitorRanksMap(trackedCompetitorRefs, results, cc)
          : undefined;
      return {
        country: cc,
        rank: clientRank,
        ...(not_ranked_reason ? { not_ranked_reason } : {}),
        ...(tracked_competitor_ranks ? { tracked_competitor_ranks } : {}),
      };
    });

    try {
      await writeKeywordTrackerVaultLiveRanks({
        supabase,
        workspaceId,
        appId,
        userId: user.id,
        keywordTerm: String(keyword.term ?? "").trim(),
        locale: vaultLocale,
        snapshotAt,
        marketRanks,
      });
    } catch (vaultErr) {
      console.warn(`[${ROUTE}] vault write failed (non-fatal):`, vaultErr);
    }

    const snapSelect =
      "id,rank,snapshot_at,best_rank,source,country_code,competitor_1_package,competitor_1_rank,competitor_2_package,competitor_2_rank";

    let insertResult = await supabase
      .from("keyword_rank_snapshots")
      .insert(rows)
      .select(snapSelect);

    if (insertResult.error && /rank_match_kind/i.test(insertResult.error.message ?? "")) {
      const legacyRows = rows.map(
        ({
          rank_match_kind: _a,
          competitor_1_match_kind: _b,
          competitor_2_match_kind: _c,
          ...rest
        }) => rest,
      );
      insertResult = await supabase
        .from("keyword_rank_snapshots")
        .insert(legacyRows)
        .select(snapSelect);
    }

    const { data: snaps, error: snapErr } = insertResult;
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
      locale: vaultLocale,
      yourApp: {
        packageId: pkg,
        canonicalPackageId: appCanonicalPkg,
        serpMatchedPackageId: appSerpMatchedPkg,
        serpLookupPackageId: serpLookupForPackage(
          pkg,
          appCanonicalPkg,
          appSerpMatchedPkg,
        ).serpLookupPackageId,
        displayName: appDisplayName,
        rank: primaryRankClient,
        rankNumeric: primaryRankRaw,
        matchKind: primaryMatch.matchKind,
        matchScore: primaryMatch.matchScore,
        matchedPackageId: primaryMatch.matchedPackageId ?? null,
        matchedSerpTitle: primaryMatch.matchedSerpTitle ?? null,
      },
      competitor1: toApiCompetitorPayload(primaryComp1),
      competitor2: toApiCompetitorPayload(primaryComp2),
      marketRanks,
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
