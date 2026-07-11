import type { SupabaseClient } from "@supabase/supabase-js";
import {
  latestPrimaryMarketRankFromSnapshots,
  primaryPlayCountryForKeyword,
  type RankSnapshotLite,
} from "@/lib/keywords/primary-market-latest-rank";
import {
  keywordRowsFromLoaded,
  resolveTrackedKeywordsForWins,
} from "@/lib/market/resolve-tracked-keywords";
import type { KeywordRankWin, RankProgressResult } from "@/lib/market/rank-progress.types";

export const MIN_RANK_WIN_POSITIONS = 2;

const POST_DEPLOYMENT_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

type SerperSnapshotRow = RankSnapshotLite & {
  keyword_id: string;
  source?: string | null;
};

type KeywordRow = {
  id: string;
  term: string;
  market: string;
  rank_at_last_listing_optimization: number | null;
};

/**
 * Resolves the Serper rank closest to deployment: newest snapshot at or before
 * `deploymentIso`, else earliest snapshot within 7 days after deployment.
 */
export function rankAtOrBeforeDeployment(
  rows: RankSnapshotLite[],
  keywordMarket: string,
  deploymentIso: string,
): { rank: number | null; snapshotAt: string | null } {
  const targetMs = new Date(deploymentIso).getTime();
  if (!Number.isFinite(targetMs)) return { rank: null, snapshotAt: null };

  const mkt = primaryPlayCountryForKeyword(keywordMarket);
  const primaryRows = rows.filter((r) => {
    const ccRaw = r.country_code;
    const cc =
      ccRaw != null && String(ccRaw).trim() !== ""
        ? String(ccRaw).trim().toLowerCase()
        : "";
    return cc === "" || cc === mkt;
  });

  const atOrBefore = [...primaryRows]
    .filter((r) => {
      const t = new Date(r.snapshot_at).getTime();
      return Number.isFinite(t) && t <= targetMs;
    })
    .sort(
      (a, b) =>
        new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime(),
    );

  const beforeHit = atOrBefore[0];
  if (beforeHit?.rank != null && Number.isFinite(beforeHit.rank)) {
    return { rank: beforeHit.rank, snapshotAt: beforeHit.snapshot_at };
  }

  const after = [...primaryRows]
    .filter((r) => {
      const t = new Date(r.snapshot_at).getTime();
      return (
        Number.isFinite(t) &&
        t > targetMs &&
        t - targetMs <= POST_DEPLOYMENT_FALLBACK_MS
      );
    })
    .sort(
      (a, b) =>
        new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime(),
    );

  const afterHit = after[0];
  if (afterHit?.rank != null && Number.isFinite(afterHit.rank)) {
    return { rank: afterHit.rank, snapshotAt: afterHit.snapshot_at };
  }

  return { rank: null, snapshotAt: null };
}

export function computePositionsGained(
  rankAtDeployment: number,
  currentRank: number,
): number {
  return rankAtDeployment - currentRank;
}

export function isRankWin(
  positionsGained: number,
  minGain: number = MIN_RANK_WIN_POSITIONS,
): boolean {
  return positionsGained >= minGain;
}

function latestSerperSnapshotMeta(
  rows: SerperSnapshotRow[],
  keywordMarket: string,
): { rank: number | null; snapshotAt: string | null } {
  const rank = latestPrimaryMarketRankFromSnapshots(rows, keywordMarket);
  if (rank == null) return { rank: null, snapshotAt: null };

  const mkt = primaryPlayCountryForKeyword(keywordMarket);
  const sorted = [...rows].sort(
    (a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime(),
  );
  for (const r of sorted) {
    const ccRaw = r.country_code;
    const cc =
      ccRaw != null && String(ccRaw).trim() !== ""
        ? String(ccRaw).trim().toLowerCase()
        : "";
    if (cc !== "" && cc !== mkt) continue;
    if (r.rank === rank) {
      return { rank, snapshotAt: r.snapshot_at };
    }
  }
  return { rank, snapshotAt: sorted[0]?.snapshot_at ?? null };
}

/**
 * Compares Serper rank snapshots at the last listing deployment vs today.
 * Returns keyword "wins" where rank improved by ≥ {@link MIN_RANK_WIN_POSITIONS}.
 */
export async function getRankProgress(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
}): Promise<RankProgressResult> {
  const { supabase, workspaceId, appId } = params;

  const empty: RankProgressResult = {
    appId,
    deploymentDate: null,
    deploymentVersionNumber: null,
    deploymentVersionId: null,
    wins: [],
    trackedKeywordCount: 0,
  };

  const { data: deployedVersion, error: versionErr } = await supabase
    .from("listing_versions")
    .select("id, version_number, deployed_at")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .eq("status", "deployed")
    .not("deployed_at", "is", null)
    .order("deployed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionErr) throw new Error(versionErr.message);
  if (!deployedVersion?.deployed_at) {
    const resolved = await resolveTrackedKeywordsForWins(
      supabase,
      workspaceId,
      appId,
    );
    if (!resolved.ok) throw new Error(resolved.message);
    return {
      ...empty,
      trackedKeywordCount: resolved.keywords.length,
    };
  }

  const deploymentDate = String(deployedVersion.deployed_at);

  const resolved = await resolveTrackedKeywordsForWins(
    supabase,
    workspaceId,
    appId,
  );
  if (!resolved.ok) throw new Error(resolved.message);
  const keywordRows = keywordRowsFromLoaded(resolved.keywords);
  if (keywordRows.length === 0) {
    return {
      ...empty,
      deploymentDate,
      deploymentVersionNumber: deployedVersion.version_number as number,
      deploymentVersionId: deployedVersion.id as string,
    };
  }

  const keywordIds = keywordRows.map((k) => k.id);
  const { data: snapshots, error: snapErr } = await supabase
    .from("keyword_rank_snapshots")
    .select("keyword_id, rank, snapshot_at, country_code, source")
    .in("keyword_id", keywordIds)
    .eq("source", "serper");

  if (snapErr) throw new Error(snapErr.message);

  const byKeyword = new Map<string, SerperSnapshotRow[]>();
  for (const row of snapshots ?? []) {
    const kid = row.keyword_id as string;
    if (!byKeyword.has(kid)) byKeyword.set(kid, []);
    byKeyword.get(kid)!.push({
      keyword_id: kid,
      rank: row.rank as number | null,
      snapshot_at: String(row.snapshot_at ?? ""),
      country_code: row.country_code as string | null | undefined,
      source: row.source as string | null,
    });
  }

  const wins: KeywordRankWin[] = [];

  for (const kw of keywordRows) {
    const serperRows = byKeyword.get(kw.id) ?? [];
    const baseline = rankAtOrBeforeDeployment(serperRows, kw.market, deploymentDate);
    let rankAtDeployment = baseline.rank;
    let baselineSnapshotAt = baseline.snapshotAt;

    if (rankAtDeployment == null) {
      const fallback = kw.rank_at_last_listing_optimization;
      if (typeof fallback === "number" && Number.isFinite(fallback)) {
        rankAtDeployment = fallback;
      }
    }

    const current = latestSerperSnapshotMeta(serperRows, kw.market);
    if (rankAtDeployment == null || current.rank == null) continue;

    const positionsGained = computePositionsGained(
      rankAtDeployment,
      current.rank,
    );
    if (!isRankWin(positionsGained)) continue;

    wins.push({
      keywordId: kw.id,
      term: kw.term,
      market: kw.market,
      rankAtDeployment,
      currentRank: current.rank,
      positionsGained,
      baselineSnapshotAt,
      currentSnapshotAt: current.snapshotAt,
    });
  }

  wins.sort((a, b) => b.positionsGained - a.positionsGained);

  return {
    appId,
    deploymentDate,
    deploymentVersionNumber: deployedVersion.version_number as number,
    deploymentVersionId: deployedVersion.id as string,
    wins,
    trackedKeywordCount: keywordRows.length,
  };
}
