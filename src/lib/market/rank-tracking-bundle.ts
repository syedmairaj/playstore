import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import {
  latestPrimaryMarketRankFromSnapshots,
  primaryPlayCountryForKeyword,
  type RankSnapshotLite,
} from "@/lib/keywords/primary-market-latest-rank";
import {
  keywordRowsFromLoaded,
  resolveTrackedKeywordsForWins,
} from "@/lib/market/resolve-tracked-keywords";

export type MarketRankSnapshotRow = RankSnapshotLite & {
  keyword_id: string;
  search_volume?: number | null;
};

export type MarketRankKeywordRow = {
  id: string;
  term: string;
  market: string;
  app_id?: string | null;
  rank_at_last_listing_optimization: number | null;
};

export type MarketRankBundle = {
  appId: string;
  deploymentDate: string | null;
  deploymentVersionNumber: number | null;
  deploymentVersionId: string | null;
  keywords: MarketRankKeywordRow[];
  snapshotsByKeyword: Map<string, MarketRankSnapshotRow[]>;
  keywordScope: "app" | "workspace";
  monitoringByKeywordMarket: Map<string, string>;
};

function snapshotsFromKeywordWithRanks(kw: KeywordWithRanks): MarketRankSnapshotRow[] {
  const rows: MarketRankSnapshotRow[] = [];
  const seen = new Set<string>();

  for (const rank of kw.ranks) {
    const key = `${rank.captured_at}:${rank.country_code ?? ""}:${rank.rank}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      keyword_id: kw.id,
      rank: rank.rank,
      snapshot_at: rank.captured_at,
      country_code: rank.country_code,
      search_volume: null,
    });
  }

  for (const entry of kw.latestPerCountry ?? []) {
    const key = `${entry.captured_at}:${entry.country}:${entry.rank}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      keyword_id: kw.id,
      rank: entry.rank,
      snapshot_at: entry.captured_at,
      country_code: entry.country,
      search_volume: null,
    });
  }

  if (kw.latest?.captured_at && kw.latest.rank != null) {
    const key = `${kw.latest.captured_at}::${kw.latest.rank}`;
    if (!seen.has(key)) {
      rows.push({
        keyword_id: kw.id,
        rank: kw.latest.rank,
        snapshot_at: kw.latest.captured_at,
        country_code: null,
        search_volume: null,
      });
    }
  }

  return rows;
}

export async function loadMarketRankBundle(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
}): Promise<MarketRankBundle> {
  const { supabase, workspaceId, appId } = params;

  let deploymentQuery = supabase
    .from("listing_versions")
    .select("id, version_number, deployed_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "deployed")
    .not("deployed_at", "is", null)
    .order("deployed_at", { ascending: false })
    .limit(1);

  deploymentQuery = deploymentQuery.eq("app_id", appId);

  const { data: deployedVersion, error: versionErr } =
    await deploymentQuery.maybeSingle();

  if (versionErr) throw new Error(versionErr.message);

  const resolved = await resolveTrackedKeywordsForWins(
    supabase,
    workspaceId,
    appId,
  );
  if (!resolved.ok) throw new Error(resolved.message);

  const keywordRows = keywordRowsFromLoaded(resolved.keywords);
  const snapshotsByKeyword = new Map<string, MarketRankSnapshotRow[]>();

  for (const kw of resolved.keywords) {
    snapshotsByKeyword.set(kw.id, snapshotsFromKeywordWithRanks(kw));
  }

  const keywordIds = keywordRows.map((k) => k.id);
  const monitoringByKeywordMarket = new Map<string, string>();

  if (keywordIds.length > 0) {
    const { data: monitoringRows, error: monitoringErr } = await supabase
      .from("rank_monitoring")
      .select("keyword_id, market, status")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .in("keyword_id", keywordIds);

    if (monitoringErr) throw new Error(monitoringErr.message);

    for (const row of monitoringRows ?? []) {
      const key = `${row.keyword_id as string}:${String(row.market).toLowerCase()}`;
      monitoringByKeywordMarket.set(key, String(row.status));
    }

    const { data: snapshots, error: snapErr } = await supabase
      .from("keyword_rank_snapshots")
      .select("keyword_id, rank, snapshot_at, country_code, source, search_volume")
      .in("keyword_id", keywordIds)
      .eq("source", "serper");

    if (snapErr) throw new Error(snapErr.message);

    for (const row of snapshots ?? []) {
      const kid = row.keyword_id as string;
      if (!snapshotsByKeyword.has(kid)) snapshotsByKeyword.set(kid, []);
      const list = snapshotsByKeyword.get(kid)!;
      const snapshot: MarketRankSnapshotRow = {
        keyword_id: kid,
        rank: row.rank as number | null,
        snapshot_at: String(row.snapshot_at ?? ""),
        country_code: row.country_code as string | null | undefined,
        search_volume:
          typeof row.search_volume === "number" ? row.search_volume : null,
      };
      const dup = list.some(
        (s) =>
          s.snapshot_at === snapshot.snapshot_at &&
          s.country_code === snapshot.country_code &&
          s.rank === snapshot.rank,
      );
      if (!dup) list.push(snapshot);
    }
  }

  return {
    appId,
    deploymentDate: deployedVersion?.deployed_at
      ? String(deployedVersion.deployed_at)
      : null,
    deploymentVersionNumber: (deployedVersion?.version_number as number) ?? null,
    deploymentVersionId: (deployedVersion?.id as string) ?? null,
    keywords: keywordRows,
    snapshotsByKeyword,
    keywordScope: resolved.scope,
    monitoringByKeywordMarket,
  };
}

export function filterPrimaryMarketRows(
  rows: RankSnapshotLite[],
  keywordMarket: string,
): RankSnapshotLite[] {
  const mkt = primaryPlayCountryForKeyword(keywordMarket);
  return rows.filter((r) => {
    const ccRaw = r.country_code;
    const cc =
      ccRaw != null && String(ccRaw).trim() !== ""
        ? String(ccRaw).trim().toLowerCase()
        : "";
    return cc === "" || cc === mkt;
  });
}

export function latestSnapshotMeta(
  rows: MarketRankSnapshotRow[],
  keywordMarket: string,
): {
  rank: number | null;
  snapshotAt: string | null;
  searchVolume: number | null;
} {
  const rank = latestPrimaryMarketRankFromSnapshots(rows, keywordMarket);
  if (rank == null) return { rank: null, snapshotAt: null, searchVolume: null };

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
      return {
        rank,
        snapshotAt: r.snapshot_at,
        searchVolume:
          typeof r.search_volume === "number" ? r.search_volume : null,
      };
    }
  }
  const hit = sorted[0];
  return {
    rank,
    snapshotAt: hit?.snapshot_at ?? null,
    searchVolume:
      typeof hit?.search_volume === "number" ? hit.search_volume : null,
  };
}

export function rankNearTimestamp(
  rows: MarketRankSnapshotRow[],
  keywordMarket: string,
  targetMs: number,
): number | null {
  const primaryRows = filterPrimaryMarketRows(rows, keywordMarket).filter(
    (r) => r.rank != null && Number.isFinite(r.rank),
  );
  if (primaryRows.length === 0) return null;

  let best: RankSnapshotLite | null = null;
  let bestDelta = Infinity;

  for (const row of primaryRows) {
    const t = new Date(row.snapshot_at).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = row;
    }
  }

  return best?.rank ?? null;
}

export function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function buildSparkline7d(
  rows: MarketRankSnapshotRow[],
  keywordMarket: string,
  nowMs: number = Date.now(),
): (number | null)[] {
  const primaryRows = filterPrimaryMarketRows(rows, keywordMarket);
  const latestPerDay = new Map<string, MarketRankSnapshotRow>();

  for (const row of primaryRows) {
    if (row.rank == null || !Number.isFinite(row.rank)) continue;
    const day = utcDateKey(row.snapshot_at);
    const existing = latestPerDay.get(day);
    if (
      !existing ||
      new Date(row.snapshot_at).getTime() >
        new Date(existing.snapshot_at).getTime()
    ) {
      latestPerDay.set(day, row as MarketRankSnapshotRow);
    }
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const points: (number | null)[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayMs = nowMs - i * MS_PER_DAY;
    const day = new Date(dayMs).toISOString().slice(0, 10);
    points.push(latestPerDay.get(day)?.rank ?? null);
  }

  return points;
}
