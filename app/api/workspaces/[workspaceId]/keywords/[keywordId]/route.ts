import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SERPER_MAX_COUNTRIES,
  isSupportedCountry,
  type SupportedCountryCode,
} from "@/lib/countries";
import { collapseSnapshotsToBestRankSeries } from "@/lib/keywords/collapse-rank-snapshots-for-display";
import {
  computeLatestPerCountryFromSnapshotRows,
  headlineLatestFromPerCountry,
} from "@/lib/keywords/load-workspace-keywords";
import { keywordMarketToPlayCountryCode } from "@/lib/keywords/rank-snapshot-market";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string; keywordId: string }> };

export async function GET(_request: Request, context: Ctx) {
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

  const { data: keyword, error: kwErr } = await supabase
    .from("keywords")
    .select(
      "id,term,market,locale,created_at,app_id,best_rank,aso_baseline_rank,aso_baseline_captured_at,last_listing_optimization_generation_id,last_listing_optimization_at,rank_at_last_listing_optimization",
    )
    .eq("id", keywordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (kwErr || !keyword) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Keyword not found" } },
      { status: 404 },
    );
  }

  const { data: rankRows, error: rErr } = await supabase
    .from("keyword_rank_snapshots")
    .select("rank,snapshot_at,best_rank,country_code,source")
    .eq("keyword_id", keywordId)
    .order("snapshot_at", { ascending: false })
    .limit(500);

  if (rErr) {
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: rErr.message } },
      { status: 400 },
    );
  }

  const allRows = rankRows ?? [];
  let lastSyncedAt: string | null = null;
  const codeSet = new Set<string>();
  for (const r of allRows) {
    const iso = String(r.snapshot_at ?? "");
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) {
      if (!lastSyncedAt || t > new Date(lastSyncedAt).getTime()) lastSyncedAt = iso;
    }
    const cc = r.country_code as string | null | undefined;
    if (cc != null && String(cc).trim() !== "") {
      codeSet.add(String(cc).trim().toLowerCase());
    }
  }
  const trackedCountryCodes: SupportedCountryCode[] = [...codeSet]
    .sort()
    .filter((c): c is SupportedCountryCode => isSupportedCountry(c))
    .slice(0, SERPER_MAX_COUNTRIES);

  const rawForCollapse = (rankRows ?? []).map((r) => ({
    rank: r.rank as number | null,
    snapshot_at: String(r.snapshot_at ?? ""),
    country_code: r.country_code as string | null | undefined,
    source: r.source as string | null | undefined,
  }));
  const rawMarket = String(keyword.market ?? "us").trim();
  const primaryM =
    (keywordMarketToPlayCountryCode(rawMarket) ?? rawMarket.toLowerCase()) || "us";
  const collapsed = collapseSnapshotsToBestRankSeries(rawForCollapse, {
    primaryMarket: primaryM,
  });
  const ranks = collapsed.map((p) => ({
    rank: p.rank,
    captured_at: p.captured_at,
    best_rank: null as number | null,
    country_code: p.country_code,
    source: p.source ?? "serper",
  }));

  const regionalTagged = (rankRows ?? []).filter((r) => {
    const cc = r.country_code as string | null | undefined;
    return cc != null && String(cc).trim() !== "";
  });
  const regionalRanks = [...regionalTagged]
    .sort((a, b) => {
      const ca = String(a.country_code).trim().toLowerCase();
      const cb = String(b.country_code).trim().toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return (
        new Date(a.snapshot_at as string).getTime() - new Date(b.snapshot_at as string).getTime()
      );
    })
    .map((r) => ({
      country_code: String(r.country_code).trim().toLowerCase(),
      rank: r.rank as number | null,
      captured_at: r.snapshot_at as string,
      source: (r.source as string | null | undefined) ?? null,
    }));

  const latestPerCountry = computeLatestPerCountryFromSnapshotRows(
    allRows.map((r) => ({
      rank: r.rank as number | null,
      snapshot_at: String(r.snapshot_at ?? ""),
      country_code: r.country_code as string | null | undefined,
    })),
  );

  const headline = headlineLatestFromPerCountry(String(keyword.market ?? ""), latestPerCountry);

  let latest: {
    rank: number | null;
    captured_at: string;
    best_rank?: number | null;
    country_code?: string | null;
    source?: string | null;
  } | null = null;

  if (headline && latestPerCountry.length > 0) {
    const src =
      latestPerCountry.find(
        (e) => e.rank === headline.rank && e.captured_at === headline.captured_at,
      ) ?? latestPerCountry[0];
    latest = {
      rank: headline.rank,
      captured_at: headline.captured_at,
      best_rank: null,
      country_code: src?.country ?? null,
      source: "serper",
    };
  } else if (ranks.length > 0) {
    const last = ranks[ranks.length - 1]!;
    latest = {
      rank: last.rank,
      captured_at: last.captured_at,
      best_rank: null,
      country_code: last.country_code,
      source: last.source,
    };
  }

  if (!latest && (rankRows ?? []).length > 0) {
    const rows = rankRows ?? [];
    const sorted = [...rows].sort(
      (a, b) =>
        new Date(b.snapshot_at as string).getTime() -
        new Date(a.snapshot_at as string).getTime(),
    );
    const newestMs = sorted.length
      ? new Date(sorted[0]!.snapshot_at as string).getTime()
      : NaN;
    const newestPrimary =
      Number.isFinite(newestMs) &&
      sorted.find((r) => {
        if (new Date(r.snapshot_at as string).getTime() !== newestMs) return false;
        const cc = r.country_code as string | null | undefined;
        return cc != null && String(cc).trim().toLowerCase() === primaryM;
      });
    const newest = newestPrimary ?? sorted[0];
    if (newest) {
      latest = {
        rank: newest.rank as number | null,
        captured_at: String(newest.snapshot_at ?? ""),
        best_rank: newest.best_rank as number | null,
        country_code:
          newest.country_code != null && String(newest.country_code).trim() !== ""
            ? String(newest.country_code).trim().toLowerCase()
            : null,
        source: (newest.source as string | null | undefined) ?? null,
      };
    }
  }

  const kwExt = keyword as {
    aso_baseline_rank?: number | null;
    aso_baseline_captured_at?: string | null;
    last_listing_optimization_generation_id?: string | null;
    last_listing_optimization_at?: string | null;
    rank_at_last_listing_optimization?: number | null;
  };

  let positionsSinceLastOptimization: number | undefined;
  const headlineRank = (latest?.rank ?? headline?.rank) ?? null;
  if (
    kwExt.last_listing_optimization_generation_id &&
    kwExt.aso_baseline_captured_at &&
    kwExt.last_listing_optimization_at &&
    kwExt.rank_at_last_listing_optimization != null &&
    Number.isFinite(kwExt.rank_at_last_listing_optimization)
  ) {
    const baseT = new Date(String(kwExt.aso_baseline_captured_at)).getTime();
    const optT = new Date(String(kwExt.last_listing_optimization_at)).getTime();
    if (Number.isFinite(baseT) && Number.isFinite(optT) && optT >= baseT) {
      const ref = kwExt.rank_at_last_listing_optimization as number;
      if (headlineRank != null && headlineRank < ref) {
        positionsSinceLastOptimization = ref - headlineRank;
      }
    }
  }

  const kwBest = (keyword as { best_rank?: number | null }).best_rank;
  const keywordBestRank =
    typeof kwBest === "number" && Number.isFinite(kwBest) ? kwBest : undefined;

  return NextResponse.json({
    ok: true,
    keyword: {
      id: keyword.id,
      term: keyword.term,
      market: keyword.market,
      locale: keyword.locale,
      created_at: keyword.created_at,
      app_id: keyword.app_id,
      keywordBestRank,
      ranks,
      regionalRanks,
      latest,
      latestPerCountry: latestPerCountry.length > 0 ? latestPerCountry : undefined,
      trackedCountryCodes: trackedCountryCodes.length > 0 ? trackedCountryCodes : undefined,
      lastSyncedAt,
      lastListingOptimizationGenerationId:
        kwExt.last_listing_optimization_generation_id ?? null,
      lastListingOptimizationAt: kwExt.last_listing_optimization_at ?? null,
      rankAtLastListingOptimization: kwExt.rank_at_last_listing_optimization ?? null,
      asoBaselineRank:
        typeof kwExt.aso_baseline_rank === "number" && Number.isFinite(kwExt.aso_baseline_rank)
          ? kwExt.aso_baseline_rank
          : kwExt.aso_baseline_rank != null
            ? Number(kwExt.aso_baseline_rank)
            : null,
      asoBaselineCapturedAt: kwExt.aso_baseline_captured_at ?? null,
      positionsSinceLastOptimization,
    },
  });
}

export async function DELETE(_request: Request, context: Ctx) {
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

  const { data: keyword, error: selErr } = await supabase
    .from("keywords")
    .select("id")
    .eq("id", keywordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (selErr || !keyword) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Keyword not found" } },
      { status: 404 },
    );
  }

  const { error } = await supabase.from("keywords").delete().eq("id", keywordId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "delete_error", message: error.message } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
