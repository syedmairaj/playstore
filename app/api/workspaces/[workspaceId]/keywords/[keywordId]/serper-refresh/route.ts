import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildInsufficientAiCreditsPayload,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features/billing/workspace-ai-credits";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import { maybeCreateRankAlerts } from "@/lib/keywords/evaluate-alerts";
import {
  resolveRankForSerperSnapshot,
  serperCountriesForKeywordRefresh,
} from "@/lib/keywords/serper-snapshot-rank";
import {
  SerperNotConfiguredError,
  isSerperConfigured,
  searchPlayStore,
} from "@/lib/serper";
import { getWorkspaceRole } from "@/lib/workspace/membership";

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
    .select("id,package_name,target_countries")
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

  const countries = serperCountriesForKeywordRefresh({
    keywordMarket: String(keyword.market ?? "us"),
    targetCountries: appRow.target_countries as string[] | null | undefined,
  });

  const creditCost = countries.length * AI_CREDIT_COSTS.serper_preview_per_country;

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

  try {
    const results = await searchPlayStore(String(keyword.term ?? "").trim(), countries);
    const rank = resolveRankForSerperSnapshot(results, pkg, String(keyword.market ?? "us"));

    const { data: prevRows } = await supabase
      .from("keyword_rank_snapshots")
      .select("rank,snapshot_at")
      .eq("keyword_id", keywordId)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    const prevRank =
      prevRows && prevRows.length > 0 ? (prevRows[0].rank as number | null) : null;

    const { data: snap, error: snapErr } = await supabase
      .from("keyword_rank_snapshots")
      .insert({
        keyword_id: keywordId,
        rank,
        source: "serper",
      })
      .select("id,rank,snapshot_at,best_rank,source")
      .single();

    if (snapErr || !snap) {
      throw new Error(snapErr?.message ?? "snapshot_insert_failed");
    }

    await maybeCreateRankAlerts({
      supabase,
      workspaceId,
      keywordId,
      keywordTerm: String(keyword.term ?? ""),
      prevRank,
      newRank: rank,
    });

    return NextResponse.json({
      ok: true,
      rank: snap.rank,
      snapshotAt: snap.snapshot_at,
      creditsCharged: creditCost,
      countries,
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
