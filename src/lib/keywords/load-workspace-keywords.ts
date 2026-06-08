import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SERPER_MAX_COUNTRIES,
  isSupportedCountry,
  type SupportedCountryCode,
} from "@/lib/countries";
import {
  collapseSnapshotsToBestRankSeries,
} from "@/lib/keywords/collapse-rank-snapshots-for-display";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { keywordMarketToPlayCountryCode } from "@/lib/keywords/rank-snapshot-market";
import { demoRankRowsForInsert } from "@/lib/keywords/demo-rank-snapshots";
import {
  KEYWORDS_SELECT_WITH_ASO_ROI,
  KEYWORDS_SELECT_WITHOUT_ASO_ROI,
  keywordsSelectFallbackForError,
} from "@/lib/keywords/keywords-select-columns";

const RECENT_RANK_GAIN_BADGE_MS = 7 * 24 * 60 * 60 * 1000;

export type KeywordRankHistoryRow = {
  rank: number | null;
  captured_at: string;
  best_rank?: number | null;
  /** Lowercase alpha-2 when tagged; omitted or null for legacy rows. */
  country_code?: string | null;
  /** e.g. `serper`, `manual`, `demo` */
  source?: string | null;
};

/** Per-country snapshots for multi-market regional charts (from `keyword_rank_snapshots`). */
export type KeywordRegionalRankRow = {
  country_code: string;
  rank: number | null;
  captured_at: string;
  source?: string | null;
};

export type KeywordWithRanks = {
  id: string;
  term: string;
  market: string;
  locale: string;
  created_at: string;
  app_id: string;
  /** Rolling best rank on `keywords` row (maintained by DB trigger); preferred for “Best” column. */
  keywordBestRank?: number | null;
  ranks: KeywordRankHistoryRow[];
  latest: { rank: number | null; captured_at: string } | null;
  /**
   * Newest snapshot per saved country (from `keyword_rank_snapshots.country_code`).
   * Drives accurate multi-market current ranks in the table.
   */
  latestPerCountry?: { country: SupportedCountryCode; rank: number; captured_at: string }[];
  /** All tagged snapshots by country (not filtered to keyword `market`). From GET single-keyword only. */
  regionalRanks?: KeywordRegionalRankRow[];
  /** Distinct snapshot country codes for this keyword (for table flag chips). */
  trackedCountryCodes?: SupportedCountryCode[];
  /** Max `snapshot_at` across all snapshot rows for this keyword. */
  lastSyncedAt?: string | null;
  /** Positions gained (lower rank is better) within ~7 days; shown as a green badge in the table. */
  recentRankGainBadge?: number;
  lastListingOptimizationGenerationId?: string | null;
  lastListingOptimizationAt?: string | null;
  rankAtLastListingOptimization?: number | null;
  asoBaselineRank?: number | null;
  asoBaselineCapturedAt?: string | null;
  /** Present on single-keyword fetch: headline rank improved vs `rank_at_last_listing_optimization`. */
  positionsSinceLastOptimization?: number;
};

type LoadOpts = {
  /** When set, only keywords for this app are returned. */
  appId?: string | null;
  /** Insert deterministic demo snapshots when a keyword has no rows (tests only; default false). */
  ensureDemoSnapshots?: boolean;
};

type SnapshotAgg = {
  lastIso: string | null;
  codes: Set<string>;
};

type RawRankSnapshot = {
  rank: number | null;
  snapshot_at: string;
  country_code?: string | null;
  source?: string | null;
};

type CountryTaggedRankRow = {
  rank: number | null;
  snapshot_at: string;
  country_code: string | null | undefined;
};

export function computeLatestPerCountryFromSnapshotRows(rows: CountryTaggedRankRow[]): {
  country: SupportedCountryCode;
  rank: number;
  captured_at: string;
}[] {
  const by = new Map<string, { rank: number; captured_at: string; t: number }>();
  for (const r of rows) {
    const ccRaw = r.country_code;
    const cc =
      ccRaw != null && String(ccRaw).trim() !== ""
        ? String(ccRaw).trim().toLowerCase()
        : "";
    if (!cc || !isSupportedCountry(cc)) continue;
    const rk = typeof r.rank === "number" ? r.rank : Number(r.rank);
    if (!Number.isFinite(rk)) continue;
    const iso = String(r.snapshot_at ?? "");
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) continue;
    const prev = by.get(cc);
    if (!prev || t > prev.t) by.set(cc, { rank: rk, captured_at: iso, t });
  }
  return [...by.entries()]
    .map(([country, v]) => ({
      country: country as SupportedCountryCode,
      rank: v.rank,
      captured_at: v.captured_at,
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

export function headlineLatestFromPerCountry(
  marketRaw: string,
  perCountry: { country: SupportedCountryCode; rank: number; captured_at: string }[],
): { rank: number; captured_at: string } | null {
  if (perCountry.length === 0) return null;
  const pm =
    keywordMarketToPlayCountryCode(String(marketRaw).trim()) ??
    String(marketRaw).trim().toLowerCase();
  const primaryHit = perCountry.find((p) => p.country === pm);
  if (primaryHit) return { rank: primaryHit.rank, captured_at: primaryHit.captured_at };
  const organic = perCountry.filter((p) => p.rank < SERPER_RANK_NOT_IN_FIRST_PAGE);
  if (organic.length > 0) {
    const best = organic.reduce((a, b) => (a.rank <= b.rank ? a : b));
    return { rank: best.rank, captured_at: best.captured_at };
  }
  const maxRank = perCountry.reduce((a, b) => (a.rank >= b.rank ? a : b));
  return { rank: maxRank.rank, captured_at: maxRank.captured_at };
}

async function fetchRanksGrouped(
  supabase: SupabaseClient,
  keywordIds: string[],
  marketByKeywordId: Record<string, string>,
): Promise<{
  ranksByKeyword: Record<string, KeywordRankHistoryRow[]>;
  aggByKeyword: Record<string, SnapshotAgg>;
  latestPerCountryByKid: Record<
    string,
    { country: SupportedCountryCode; rank: number; captured_at: string }[]
  >;
}> {
  const ranksByKeyword: Record<string, KeywordRankHistoryRow[]> = {};
  const aggByKeyword: Record<string, SnapshotAgg> = {};
  const latestPerCountryByKid: Record<
    string,
    { country: SupportedCountryCode; rank: number; captured_at: string }[]
  > = {};
  if (keywordIds.length === 0)
    return { ranksByKeyword, aggByKeyword, latestPerCountryByKid };

  const { data: rankRows, error } = await supabase
    .from("keyword_rank_snapshots")
    .select("keyword_id,rank,snapshot_at,country_code,source")
    .in("keyword_id", keywordIds);

  if (error) {
    throw new Error(error.message);
  }

  const byKidRaw = new Map<string, CountryTaggedRankRow[]>();
  for (const row of rankRows ?? []) {
    const kid = row.keyword_id as string;
    if (!byKidRaw.has(kid)) byKidRaw.set(kid, []);
    byKidRaw.get(kid)!.push({
      rank: row.rank as number | null,
      snapshot_at: String(row.snapshot_at ?? ""),
      country_code: row.country_code as string | null | undefined,
    });
  }

  for (const kid of keywordIds) {
    latestPerCountryByKid[kid] = computeLatestPerCountryFromSnapshotRows(byKidRaw.get(kid) ?? []);
  }

  for (const row of rankRows ?? []) {
    const kid = row.keyword_id as string;
    const iso = String(row.snapshot_at ?? "");
    if (!aggByKeyword[kid]) {
      aggByKeyword[kid] = { lastIso: null, codes: new Set() };
    }
    const agg = aggByKeyword[kid];
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) {
      if (!agg.lastIso) agg.lastIso = iso;
      else if (t > new Date(agg.lastIso).getTime()) agg.lastIso = iso;
    }
    const ccRaw = row.country_code as string | null | undefined;
    if (ccRaw != null && String(ccRaw).trim() !== "") {
      agg.codes.add(String(ccRaw).trim().toLowerCase());
    }
  }

  const byKid = new Map<string, RawRankSnapshot[]>();
  for (const row of rankRows ?? []) {
    const kid = row.keyword_id as string;
    if (!byKid.has(kid)) byKid.set(kid, []);
    byKid.get(kid)!.push({
      rank: row.rank as number | null,
      snapshot_at: String(row.snapshot_at ?? ""),
      country_code: row.country_code as string | null | undefined,
      source: row.source as string | null | undefined,
    });
  }

  for (const [kid, raw] of byKid) {
    const rawMarket = String(marketByKeywordId[kid] ?? "").trim();
    const primaryMarket =
      keywordMarketToPlayCountryCode(rawMarket) ?? (rawMarket ? rawMarket.toLowerCase() : null);
    const collapsed = collapseSnapshotsToBestRankSeries(raw, { primaryMarket });
    const tail = collapsed.slice(-40);
    ranksByKeyword[kid] = tail.map((p) => ({
      rank: p.rank,
      captured_at: p.captured_at,
      country_code: p.country_code,
      source: p.source ?? "serper",
    }));
  }

  return { ranksByKeyword, aggByKeyword, latestPerCountryByKid };
}

export async function loadWorkspaceKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: LoadOpts,
): Promise<{ ok: true; keywords: KeywordWithRanks[] } | { ok: false; message: string }> {
  const ensureDemo = options?.ensureDemoSnapshots === true;

  async function fetchKeywordRows(select: string) {
    let q = supabase
      .from("keywords")
      .select(select)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (options?.appId) {
      q = q.eq("app_id", options.appId);
    }
    return q;
  }

  let selectList: string = KEYWORDS_SELECT_WITH_ASO_ROI;
  let { data: keywords, error } = await fetchKeywordRows(selectList);

  if (error) {
    const fallback = keywordsSelectFallbackForError(error.message);
    if (fallback !== selectList) {
      selectList = fallback;
      const retry = await fetchKeywordRows(selectList);
      keywords = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  type KeywordSelectRow = {
    id: string;
    term: string;
    market: string;
    locale: string;
    created_at: string;
    app_id: string;
    best_rank?: number | null;
    [key: string]: unknown;
  };

  const list = (keywords ?? []) as unknown as KeywordSelectRow[];
  const ids = list.map((k) => k.id);
  const marketByKeywordId = Object.fromEntries(list.map((k) => [k.id, String(k.market ?? "")]));

  try {
    let { ranksByKeyword, aggByKeyword, latestPerCountryByKid } = await fetchRanksGrouped(
      supabase,
      ids,
      marketByKeywordId,
    );

    if (ensureDemo) {
      const missing = list.filter((k) => (ranksByKeyword[k.id]?.length ?? 0) === 0);
      if (missing.length > 0) {
        const rows = missing.flatMap((k) => demoRankRowsForInsert(k.id, k.term));
        const { error: insErr } = await supabase.from("keyword_rank_snapshots").insert(rows);
        if (insErr) {
          return { ok: false, message: insErr.message };
        }
        const next = await fetchRanksGrouped(supabase, ids, marketByKeywordId);
        ranksByKeyword = next.ranksByKeyword;
        aggByKeyword = next.aggByKeyword;
        latestPerCountryByKid = next.latestPerCountryByKid;
      }
    }

    const payload: KeywordWithRanks[] = list.map((k) => {
      const chronological = ranksByKeyword[k.id] ?? [];
      const agg = aggByKeyword[k.id];
      const perCountry = latestPerCountryByKid[k.id] ?? [];
      const headline = headlineLatestFromPerCountry(String(k.market ?? ""), perCountry);
      const latestCollapsed =
        chronological.length === 0
          ? null
          : {
              rank: chronological[chronological.length - 1]!.rank,
              captured_at: chronological[chronological.length - 1]!.captured_at,
            };
      const latest = headline
        ? { rank: headline.rank, captured_at: headline.captured_at }
        : latestCollapsed;
      const trackedCountryCodes = agg
        ? [...agg.codes]
            .sort()
            .filter((c): c is SupportedCountryCode => isSupportedCountry(c))
            .slice(0, SERPER_MAX_COUNTRIES)
        : [];
      const br = (k as { best_rank?: number | null }).best_rank;
      const keywordBestRank =
        typeof br === "number" && Number.isFinite(br) ? br : br != null ? Number(br) : null;
      const rowExt = k as {
        recent_rank_gain?: number | null;
        recent_rank_gain_at?: string | null;
        last_listing_optimization_generation_id?: string | null;
        last_listing_optimization_at?: string | null;
        rank_at_last_listing_optimization?: number | null;
        aso_baseline_rank?: number | null;
        aso_baseline_captured_at?: string | null;
      };
      const gain = rowExt.recent_rank_gain;
      const gainAt = rowExt.recent_rank_gain_at;
      let recentRankGainBadge: number | undefined;
      if (
        typeof gain === "number" &&
        Number.isFinite(gain) &&
        gain >= 5 &&
        gainAt != null &&
        String(gainAt).length > 0
      ) {
        const t = new Date(gainAt).getTime();
        if (Number.isFinite(t) && Date.now() - t <= RECENT_RANK_GAIN_BADGE_MS) {
          recentRankGainBadge = gain;
        }
      }
      return {
        id: k.id,
        term: k.term,
        market: k.market,
        locale: k.locale,
        created_at: k.created_at,
        app_id: k.app_id,
        keywordBestRank: keywordBestRank != null && Number.isFinite(keywordBestRank)
          ? keywordBestRank
          : undefined,
        ranks: chronological,
        latest,
        latestPerCountry: perCountry.length > 0 ? perCountry : undefined,
        trackedCountryCodes: trackedCountryCodes.length > 0 ? trackedCountryCodes : undefined,
        lastSyncedAt: agg?.lastIso ?? null,
        recentRankGainBadge,
        lastListingOptimizationGenerationId:
          rowExt.last_listing_optimization_generation_id ?? null,
        lastListingOptimizationAt: rowExt.last_listing_optimization_at ?? null,
        rankAtLastListingOptimization: rowExt.rank_at_last_listing_optimization ?? null,
        asoBaselineRank:
          typeof rowExt.aso_baseline_rank === "number" && Number.isFinite(rowExt.aso_baseline_rank)
            ? rowExt.aso_baseline_rank
            : rowExt.aso_baseline_rank != null
              ? Number(rowExt.aso_baseline_rank)
              : null,
        asoBaselineCapturedAt: rowExt.aso_baseline_captured_at ?? null,
      };
    });

    return { ok: true, keywords: payload };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, message: msg };
  }
}
