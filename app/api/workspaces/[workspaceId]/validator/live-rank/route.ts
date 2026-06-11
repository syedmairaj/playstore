/**
 * POST /api/workspaces/[workspaceId]/validator/live-rank
 *
 * Multi-market, credit-scaled live rank fetch for KeywordValidatorCard.
 *
 * ─── Credit model ────────────────────────────────────────────────────────────
 * Cost = countries.length × 1 credit (same rate as Keyword Tracker refresh)
 * Single atomic debit before Serper calls. Full refund if ALL markets fail.
 *
 * ─── Rank resolution ─────────────────────────────────────────────────────────
 * `resolveRankInCountryForSerperSnapshot` returns `number | null`:
 *   - integer position when the app is in the organic SERP slice
 *   - `null` when not found or Serper block errored
 *
 * API / vault responses expose that `null` as-is (UI maps to "20+" via i18n).
 * `keyword_rank_snapshots.rank` is NOT NULL — we persist
 * {@link SERPER_RANK_NOT_IN_FIRST_PAGE} when resolution is `null`.
 *
 * ─── Competitors ─────────────────────────────────────────────────────────────
 * Only workspace Competitor Spy slots (up to 2) from
 * `workspace_competitor_analyses` — never generic SERP leaders.
 * Vault: `live_ranks.[market].tracked_competitor_ranks`
 * Snapshots: `competitor_1_rank` / `competitor_2_rank`
 *
 * ─── Dual-Env Parity ─────────────────────────────────────────────────────────
 * locale="en" → state_en exclusively
 * locale="ar" → state_ar exclusively
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  loadAppForSerperRank,
  loadCompetitorsForSerperRank,
} from "@/lib/workspace/load-app-for-serper-rank";
import {
  readWorkspaceAiCreditsRemaining,
  buildInsufficientAiCreditsPayload,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import {
  searchPlayStore,
  isSerperConfigured,
  SerperNotConfiguredError,
  type SerperPlayStoreCountryResult,
} from "@/lib/serper";
import { serperAiCreditsForCountryCount } from "@/lib/keywords/keyword-track-ai-pricing";
import {
  buildTrackedCompetitorRanksMap,
  formatTrackedCompetitorRankForDb,
  type TrackedCompetitorRef,
} from "@/lib/keywords/tracked-competitor-ranks";
import {
  resolveRankInCountryForSerperSnapshot,
  resolveRankMatchInCountryForSerperSnapshot,
  rankForSnapshotInsert,
  normPkgForSerperSnapshot,
  applyLiveRankClientPolicy,
  buildSerpRankDebugPayload,
  logPoorSerpRankDebug,
  logSerpTargetMatchResult,
  serpLookupForPackage,
  warnWhenMissingCanonicalPackageId,
  type LiveRankNotRankedReason,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

const ROUTE = "POST /api/workspaces/[workspaceId]/validator/live-rank";
const MAX_MARKETS = 4;

const bodySchema = z.object({
  keyword: z.string().min(1).max(100).trim(),
  countries: z
    .array(z.string().min(2).max(4).toLowerCase().trim())
    .min(1)
    .max(MAX_MARKETS),
  appId: z.string().uuid(),
  locale: z.enum(["en", "ar"]).default("en"),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

type MarketResult = {
  country: string;
  /** Organic position within visibility window; `null` = not ranked for UI. */
  rank: number | null;
  not_ranked_reason?: LiveRankNotRankedReason;
  /** How the app was matched in the SERP slice (debug). */
  match_kind?: "package" | "title" | "none";
  tracked_competitor_ranks?: Record<string, number | null>;
  error?: string;
};

function resolveMarketResult(
  serperResults: readonly SerperPlayStoreCountryResult[],
  market: string,
  packageName: string,
  appDisplayName: string | null,
  appCanonicalPackageId: string | null,
  appSerpMatchedPackageId: string | null,
  trackedCompetitors: readonly TrackedCompetitorRef[],
  missingCanonicalWarned: Set<string>,
): MarketResult {
  const block = serperResults.find(
    (r) => String(r.country ?? "").trim().toLowerCase() === market,
  );

  if (!block || block.error) {
    console.log(`[${ROUTE}] serper block error`, {
      market,
      error: block?.error ?? "No results",
    });
    return {
      country: market,
      rank: null,
      not_ranked_reason: "serper_error",
      error: block?.error ?? "No results",
    };
  }

  const debugTargets = [
    {
      label: "your_app",
      packageName,
      canonicalPackageId: appCanonicalPackageId,
      serpMatchedPackageId: appSerpMatchedPackageId,
      displayName: appDisplayName,
    },
    ...trackedCompetitors.map((c, i) => ({
      label: `competitor_${i + 1}`,
      packageName: c.package_name,
      canonicalPackageId: c.canonical_package_id ?? null,
      serpMatchedPackageId: c.serp_matched_package_id ?? null,
      displayName: c.name ?? null,
    })),
  ];
  const matchDebug = buildSerpRankDebugPayload(block.items, debugTargets, {
    serpLimit: 10,
  });

  console.log(`[${ROUTE}] serp match debug`, {
    market,
    serpPlayAppCount: block.items.length,
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
      serperResults,
      target.packageName,
      market,
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
        country: market,
        label: target.label,
        internalPackageId: lookup.internalPackageId,
        serpLookupPackageId: lookup.serpLookupPackageId,
        usedCanonical: lookup.lookupSource === "canonical",
        displayName: target.displayName,
      },
      match,
    );
  }

  const yourMatch = matchDebug.matches.find((m) => m.label === "your_app");
  const rawRank = yourMatch?.rank ?? null;
  const matchKind = yourMatch?.matchKind ?? "none";
  const matchScore = yourMatch?.matchScore ?? null;
  const { rank: clientRank, not_ranked_reason } = applyLiveRankClientPolicy(rawRank);

  const tracked_competitor_ranks =
    trackedCompetitors.length > 0
      ? buildTrackedCompetitorRanksMap(trackedCompetitors, serperResults, market)
      : undefined;

  logPoorSerpRankDebug(ROUTE, { market, keyword_market: market }, block.items, debugTargets);

  console.log(`[${ROUTE}] rank resolved`, {
    market,
    packageName,
    appDisplayName,
    rawRank,
    clientRank,
    matchKind,
    matchScore,
    not_ranked_reason,
    itemCount: block.items.length,
    competitorMatches: matchDebug.matches.filter((m) => m.label !== "your_app"),
  });

  return {
    country: market,
    rank: clientRank,
    ...(not_ranked_reason ? { not_ranked_reason } : {}),
    match_kind: matchKind,
    ...(tracked_competitor_ranks && Object.keys(tracked_competitor_ranks).length > 0
      ? { tracked_competitor_ranks }
      : {}),
  };
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
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation", message: err.errors[0]?.message ?? "Invalid request" },
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 },
    );
  }

  const { keyword, countries, appId, locale } = body;
  const markets = [...new Set(countries)];
  const creditCost = serperAiCreditsForCountryCount(markets.length);

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
      { status: 404 },
    );
  }

  const packageName = String(appRow.package_name ?? "").trim();
  const appCanonicalPackageId = appRow.canonical_package_id;
  const appSerpMatchedPackageId = appRow.serp_matched_package_id;
  const appDisplayName = appRow.name;
  if (!normPkgForSerperSnapshot(packageName)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message:
            "Add your app's Android package name in workspace settings before fetching live ranks.",
        },
      },
      { status: 422 },
    );
  }

  if (!isSerperConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "serper_not_configured", message: "Live rank service is not configured." },
      },
      { status: 503 },
    );
  }

  const balance = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balance.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "wallet_error", message: "Could not read credit balance. Try again shortly." },
      },
      { status: 503 },
    );
  }
  if (balance.remaining < creditCost) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balance.remaining),
      { status: 402 },
    );
  }

  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: "validator_live_rank_multi",
    sourceType: "generation",
    meta: { route: ROUTE, keyword, markets, locale, creditCost },
  });

  if (!debit.ok) {
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(debit.required ?? creditCost, debit.remaining ?? 0),
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
  const rankedAt = new Date().toISOString();

  const { data: competitorRows, error: competitorLoadErr } =
    await loadCompetitorsForSerperRank(supabase, workspaceId);
  if (competitorLoadErr) {
    console.warn(`[${ROUTE}] competitor_load_failed`, competitorLoadErr.message);
  }

  const trackedCompetitors: TrackedCompetitorRef[] = competitorRows.map((row) => ({
    package_name: row.competitor_package_id,
    canonical_package_id: row.canonical_package_id,
    serp_matched_package_id: row.serp_matched_package_id,
    name: row.competitor_name,
  }));

  const missingCanonicalWarned = new Set<string>();

  const comp1Pkg = trackedCompetitors[0]?.package_name ?? null;
  const comp2Pkg = trackedCompetitors[1]?.package_name ?? null;

  let serperResults: SerperPlayStoreCountryResult[] = [];
  let marketResults: MarketResult[];

  try {
    serperResults = await searchPlayStore(keyword, markets, {
      deepRankSearch: true,
      restrictToPlayStore: true,
    });
    marketResults = markets.map((market) =>
      resolveMarketResult(
        serperResults,
        market,
        packageName,
        appDisplayName,
        appCanonicalPackageId,
        appSerpMatchedPackageId,
        trackedCompetitors,
        missingCanonicalWarned,
      ),
    );
  } catch (err) {
    await refundWorkspaceAiCredits(supabase, {
      workspaceId,
      userId: user.id,
      originalLedgerId: ledgerId,
      reason: "serper_live_rank_multi_failed",
    });

    if (err instanceof SerperNotConfiguredError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "serper_not_configured", message: "Live rank service is not configured." },
        },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : "Live rank fetch failed";
    return NextResponse.json(
      { ok: false, error: { code: "rank_fetch_failed", message: msg } },
      { status: 502 },
    );
  }

  const allFailed = marketResults.every((r) => r.error);
  if (allFailed) {
    await refundWorkspaceAiCredits(supabase, {
      workspaceId,
      userId: user.id,
      originalLedgerId: ledgerId,
      reason: "serper_live_rank_all_markets_failed",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "rank_fetch_failed",
          message: "Could not fetch ranks for any requested market.",
        },
      },
      { status: 502 },
    );
  }

  // ── Vault write (locale-correct branch, additive per market) ─────────────
  try {
    const stateKey = locale === "ar" ? "state_ar" : "state_en";

    const { data: vaultRow } = await supabase
      .from("workspace_staging_vault")
      .select(`id, ${stateKey}, change_count`)
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .is("deleted_at", null)
      .maybeSingle();

    if (vaultRow) {
      const currentState = (vaultRow[stateKey as keyof typeof vaultRow] ?? {}) as Record<
        string,
        unknown
      >;
      const features = (currentState.features ?? {}) as Record<string, unknown>;
      const kvFeature = (features.keyword_validator ?? {}) as Record<string, unknown>;
      const signals = (kvFeature.signals ?? {}) as Record<string, unknown>;
      const kwSignal = (signals[keyword] ?? {}) as Record<string, unknown>;
      const existingRanks = (kwSignal.live_ranks ?? {}) as Record<string, unknown>;

      const newRanks: Record<string, unknown> = { ...existingRanks };
      for (const {
        country,
        rank,
        not_ranked_reason,
        tracked_competitor_ranks,
        error,
      } of marketResults) {
        if (error) continue;
        newRanks[country] = {
          rank,
          fetched_at: rankedAt,
          ...(not_ranked_reason ? { not_ranked_reason } : {}),
          ...(tracked_competitor_ranks && Object.keys(tracked_competitor_ranks).length > 0
            ? { tracked_competitor_ranks }
            : {}),
        };
      }

      const updatedState: Record<string, unknown> = {
        ...currentState,
        features: {
          ...features,
          keyword_validator: {
            ...kvFeature,
            signals: {
              ...signals,
              [keyword]: {
                ...kwSignal,
                live_ranks: newRanks,
                last_fetched_at: rankedAt,
              },
            },
          },
        },
      };

      await supabase
        .from("workspace_staging_vault")
        .update({
          [stateKey]: updatedState,
          updated_at: rankedAt,
          change_count: ((vaultRow.change_count as number) ?? 0) + 1,
          last_modified_by: user.id,
        })
        .eq("workspace_id", workspaceId)
        .eq("app_id", appId);
    }
  } catch (vaultErr) {
    console.warn(
      `[${ROUTE}] vault write failed (non-fatal):`,
      vaultErr instanceof Error ? vaultErr.message : String(vaultErr),
    );
  }

  // ── Sync tracked keyword snapshots (NOT NULL rank column) ─────────────────
  try {
    const { data: trackedKeywords } = await supabase
      .from("keywords")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .ilike("term", keyword.trim());

    const keywordIds = (trackedKeywords ?? []).map((k) => k.id as string);

    if (keywordIds.length > 0) {
      const snapshotRows = keywordIds.flatMap((keywordId) =>
        marketResults
          .filter((r) => !r.error)
          .map((r) => {
            const rawRank = resolveRankInCountryForSerperSnapshot(
              serperResults,
              packageName,
              r.country,
              { displayName: appDisplayName },
            );
            const dbRank = rankForSnapshotInsert(rawRank);
            const ranksMap = r.tracked_competitor_ranks ?? {};
            const pkg1Norm = comp1Pkg ? normPkgForSerperSnapshot(comp1Pkg) : null;
            const pkg2Norm = comp2Pkg ? normPkgForSerperSnapshot(comp2Pkg) : null;
            const rank1 = pkg1Norm ? (ranksMap[pkg1Norm] ?? null) : null;
            const rank2 = pkg2Norm ? (ranksMap[pkg2Norm] ?? null) : null;

            return {
              keyword_id: keywordId,
              rank: dbRank,
              source: "serper" as const,
              country_code: r.country,
              snapshot_at: rankedAt,
              competitor_1_package: comp1Pkg,
              competitor_1_rank: comp1Pkg
                ? formatTrackedCompetitorRankForDb(rank1)
                : null,
              competitor_2_package: comp2Pkg,
              competitor_2_rank: comp2Pkg
                ? formatTrackedCompetitorRankForDb(rank2)
                : null,
            };
          }),
      );

      if (snapshotRows.length > 0) {
        const { error: insertErr } = await supabase
          .from("keyword_rank_snapshots")
          .insert(snapshotRows);

        if (insertErr) {
          console.warn(`[${ROUTE}] snapshot insert failed (non-fatal):`, insertErr.message, {
            sampleRank: snapshotRows[0]?.rank,
          });
        }
      }
    }
  } catch (snapErr) {
    console.warn(
      `[${ROUTE}] snapshot sync failed (non-fatal):`,
      snapErr instanceof Error ? snapErr.message : String(snapErr),
    );
  }

  void fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/workspaces/${workspaceId}/optimizer/sync`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  ).catch(() => {
    /* non-critical */
  });

  console.log(`[${ROUTE}] complete`, {
    keyword,
    packageName,
    markets,
    locale,
    results: marketResults.map((r) => ({
      country: r.country,
      rank: r.rank,
      error: r.error,
      competitors: r.tracked_competitor_ranks
        ? Object.keys(r.tracked_competitor_ranks).length
        : 0,
    })),
    workspaceId,
    userId: user.id,
  });

  return NextResponse.json({
    ok: true,
    keyword,
    results: marketResults,
    creditsCharged: creditCost,
    balanceAfter: debit.balanceAfter,
    rankedAt,
  });
}
