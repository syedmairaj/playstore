/**
 * POST /api/workspaces/[workspaceId]/validator/live-rank
 *
 * Multi-market, credit-scaled live rank fetch for KeywordValidatorCard.
 *
 * ─── Credit model ────────────────────────────────────────────────────────────
 * Cost = countries.length × 1 credit  (same rate as Keyword Tracker refresh)
 * Single atomic debit for the full batch before any Serper calls.
 * If ALL markets fail → full refund (net 0).
 * Partial success → no refund (user receives results for succeeded markets).
 *
 * ─── Vault schema ────────────────────────────────────────────────────────────
 * Writes to state_{locale}.features.keyword_validator.signals.[keyword].live_ranks.[market_code]
 *
 * Example (locale="en", keyword="calorie", markets=["us","in"]):
 * state_en.features.keyword_validator.signals = {
 *   "calorie": {
 *     live_ranks: {
 *       "us": { rank: 1,    fetched_at: "2026-06-10T..." },
 *       "in": { rank: null, fetched_at: "2026-06-10T..." }
 *     }
 *   }
 * }
 *
 * ─── Dual-Env Parity ─────────────────────────────────────────────────────────
 * locale="en" writes to state_en exclusively.
 * locale="ar" writes to state_ar exclusively.
 * locale × market is a valid matrix: an AR listing can rank in US and IN.
 *
 * ─── Security ────────────────────────────────────────────────────────────────
 * All credit logic is server-side. Client never touches billing.
 * consume_workspace_ai_credits RPC uses SELECT FOR UPDATE — tamper-proof.
 *
 * Request body:
 * {
 *   keyword:   string,
 *   countries: string[],   // e.g. ["us", "in"]  — 1 credit each
 *   appId:     string,     // UUID
 *   locale:    "en" | "ar"
 * }
 *
 * Response:
 * {
 *   ok: true,
 *   keyword: string,
 *   results: Array<{ country: string, rank: number | null, error?: string }>,
 *   creditsCharged: number,
 *   balanceAfter: number,
 *   rankedAt: string
 * }
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
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
} from "@/lib/serper";
import { serperAiCreditsForCountryCount } from "@/lib/keywords/keyword-track-ai-pricing";
import {
  resolveRankInCountryForSerperSnapshot,
  normPkgForSerperSnapshot,
} from "@/lib/keywords/serper-snapshot-rank-resolve";
// vaultRouter NOT imported — pulls producer-registry → missing producer files →
// webpack bundle crash on keywords page. Direct supabase JSONB patch used instead.

const ROUTE = "POST /api/workspaces/[workspaceId]/validator/live-rank";
const MAX_MARKETS = 4; // mirrors Keyword Tracker CountrySelector limit

const bodySchema = z.object({
  keyword:   z.string().min(1).max(100).trim(),
  countries: z
    .array(z.string().min(2).max(4).toLowerCase().trim())
    .min(1)
    .max(MAX_MARKETS),
  appId:  z.string().uuid(),
  locale: z.enum(["en", "ar"]).default("en"),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

// ─── SERP_NOT_IN_TOP constant ─────────────────────────────────────────────────
const NOT_IN_TOP = 100; // mirrors SERPER_RANK_NOT_IN_FIRST_PAGE

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  // ── 2. Membership ────────────────────────────────────────────────────────
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 },
    );
  }

  // ── 3. Parse + validate body ─────────────────────────────────────────────
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation", message: err.errors[0]?.message ?? "Invalid request" } },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 },
    );
  }

  const { keyword, countries, appId, locale } = body;
  const markets    = [...new Set(countries)];
  const creditCost = serperAiCreditsForCountryCount(markets.length);

  // ── 4. Fetch app's package_name (needed for rank resolution) ─────────────
  // Live rank = position of THIS APP in the SERP for the keyword query.
  // We look up the app's Android package_name, then use the same
  // resolveRankInCountryForSerperSnapshot function the Keyword Tracker uses.
  // Without this, rank resolution is meaningless — we'd be finding the first
  // app whose name happens to contain the keyword word, not the user's app.
  const { data: appRow } = await supabase
    .from("apps")
    .select("package_name")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const packageName = String(appRow?.package_name ?? "").trim();
  const normPkg     = normPkgForSerperSnapshot(packageName);

  if (!normPkg) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "no_package_name",
          message: "Add your app's Android package name in workspace settings before fetching live ranks.",
        },
      },
      { status: 422 },
    );
  }

  // ── 5. Serper configured? ────────────────────────────────────────────────
  if (!isSerperConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "serper_not_configured", message: "Live rank service is not configured." } },
      { status: 503 },
    );
  }

  // ── 6. Non-locking balance pre-check ────────────────────────────────────
  const balance = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balance.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not read credit balance. Try again shortly." } },
      { status: 503 },
    );
  }
  if (balance.remaining < creditCost) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balance.remaining),
      { status: 402 },
    );
  }

  // ── 7. Atomic credit debit (SELECT FOR UPDATE RPC) ───────────────────────
  // Single debit for ALL markets upfront — prevents partial charges on
  // concurrent requests and matches Keyword Tracker's debit pattern.
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
      { ok: false, error: { code: "wallet_error", message: "Could not reserve credits. Try again shortly." } },
      { status: 503 },
    );
  }

  const ledgerId  = debit.ledgerId;
  const rankedAt  = new Date().toISOString();

  // ── 8. Parallel Serper fetches — resolve rank by package_name ────────────
  // We search Play Store for the keyword query, then find where the user's APP
  // (identified by package_name) ranks in those results. This is identical to
  // the approach used by the Keyword Tracker serper-refresh route.
  type MarketResult = { country: string; rank: number | null; error?: string };

  let marketResults: MarketResult[];
  try {
    const serperResults = await searchPlayStore(keyword, markets);

    marketResults = markets.map((market) => {
      const block = serperResults.find(
        (r) => String(r.country ?? "").trim().toLowerCase() === market,
      );
      if (!block || block.error) {
        return { country: market, rank: null, error: block?.error ?? "No results" };
      }
      // resolveRankInCountryForSerperSnapshot returns SERPER_RANK_NOT_IN_FIRST_PAGE (100)
      // when the app is not in the top results — we map that to null for the UI.
      const rawRank = resolveRankInCountryForSerperSnapshot(
        serperResults,
        packageName,
        market,
      );
      const rank = rawRank >= NOT_IN_TOP ? null : rawRank;
      return { country: market, rank };
    });
  } catch (err) {
    // All markets failed — full refund
    await refundWorkspaceAiCredits(supabase, {
      workspaceId,
      userId: user.id,
      originalLedgerId: ledgerId,
      reason: "serper_live_rank_multi_failed",
    });

    if (err instanceof SerperNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: { code: "serper_not_configured", message: "Live rank service is not configured." } },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : "Live rank fetch failed";
    return NextResponse.json(
      { ok: false, error: { code: "rank_fetch_failed", message: msg } },
      { status: 502 },
    );
  }

  // Partial failure: if every market errored, refund and surface the error.
  // If some succeeded, we keep the charge (user got partial data).
  const allFailed = marketResults.every((r) => r.error);
  if (allFailed) {
    await refundWorkspaceAiCredits(supabase, {
      workspaceId,
      userId: user.id,
      originalLedgerId: ledgerId,
      reason: "serper_live_rank_all_markets_failed",
    });
    return NextResponse.json(
      { ok: false, error: { code: "rank_fetch_failed", message: "Could not fetch ranks for any requested market." } },
      { status: 502 },
    );
  }

  // ── 9. Vault write — market-indexed JSONB (locale-correct branch) ────────
  //
  // Schema written (additive — Safety Rule compliant):
  // state_{locale}.features.keyword_validator.signals.[keyword].live_ranks.[market_code]
  //
  // This structure allows:
  //   - Multiple keywords per feature
  //   - Multiple markets per keyword
  //   - Full locale × market matrix
  //   - Non-destructive updates (each market is a separate key)
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
      const currentState  = (vaultRow[stateKey as keyof typeof vaultRow] ?? {}) as Record<string, unknown>;
      const features      = (currentState.features  ?? {}) as Record<string, unknown>;
      const kvFeature     = (features.keyword_validator ?? {}) as Record<string, unknown>;
      const signals       = (kvFeature.signals ?? {}) as Record<string, unknown>;
      const kwSignal      = (signals[keyword] ?? {}) as Record<string, unknown>;
      const existingRanks = (kwSignal.live_ranks ?? {}) as Record<string, unknown>;

      // Build new market entries (additive — never removes existing market data)
      const newRanks: Record<string, unknown> = { ...existingRanks };
      for (const { country, rank, error } of marketResults) {
        newRanks[country] = {
          rank,
          fetched_at: rankedAt,
          ...(error ? { error } : {}),
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
          [stateKey]:       updatedState,
          updated_at:       rankedAt,
          change_count:     ((vaultRow.change_count as number) ?? 0) + 1,
          last_modified_by: user.id,
        })
        .eq("workspace_id", workspaceId)
        .eq("app_id", appId);
    }
  } catch (vaultErr) {
    // Non-fatal — ranks were fetched, credits were spent
    console.warn(`[${ROUTE}] ⚠️ Vault write failed (non-fatal):`,
      vaultErr instanceof Error ? vaultErr.message : String(vaultErr),
    );
  }

  // ── 10. Optimizer sync (fire-and-forget) ─────────────────────────────────
  void fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/workspaces/${workspaceId}/optimizer/sync`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  ).catch(() => { /* non-critical */ });

  console.log(`[${ROUTE}] ✅ Multi-market rank fetch complete:`, {
    keyword, packageName, markets, locale, results: marketResults, workspaceId, userId: user.id,
  });

  return NextResponse.json({
    ok: true,
    keyword,
    results: marketResults,
    creditsCharged: creditCost,
    balanceAfter:   debit.balanceAfter,
    rankedAt,
  });
}
