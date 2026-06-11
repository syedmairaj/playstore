import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import {
  competitorInitialForDisplay,
  findBestRankInSerpItems,
  normalizeCompetitorDisplayNameForRank,
  normPkgForSerperSnapshot,
  resolveRankMatchInCountryForSerperSnapshot,
  serpLookupForPackage,
  type SerperCountryResultForSnapshot,
  type SerperRankMatchKind,
  type SerperRankMatchResult,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

export type TrackedCompetitorRef = {
  package_name: string;
  canonical_package_id?: string | null;
  serp_matched_package_id?: string | null;
  name?: string | null;
  icon_url?: string | null;
};

export type ConfiguredCompetitorSlot = "competitor_1" | "competitor_2";

export type ResolvedConfiguredCompetitor = {
  slot: ConfiguredCompetitorSlot;
  packageId: string;
  displayName: string;
  initial: string;
  iconUrl: string | null;
  rank: number | null;
  rankText: string | null;
  matchKind: SerperRankMatchKind;
  matchScore: number | null;
  matchedPackageId?: string | null;
  matchedSerpTitle?: string | null;
};

export function resolveConfiguredCompetitorDisplayName(
  rawName: string | null | undefined,
  packageId: string,
): string {
  return (
    normalizeCompetitorDisplayNameForRank(rawName) ??
    (typeof rawName === "string" && rawName.trim() ? rawName.trim() : packageId)
  );
}

export type TrackedCompetitorRankSnapshot = {
  package_name: string;
  name?: string | null;
  rank: number | null;
  match_kind?: SerperRankMatchKind | null;
  match_score?: number | null;
  serp_display_name?: string | null;
};

/** Parse stored snapshot rank text ("7", "100+") to number | null. */
export function parseTrackedCompetitorRankText(
  raw: string | null | undefined,
): number | null {
  if (raw == null || String(raw).trim() === "" || raw === "100+") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** Format rank for DB snapshot columns (text). */
export function formatTrackedCompetitorRankForDb(rank: number | null): string | null {
  if (rank == null) return "100+";
  if (rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return "100+";
  return String(rank);
}

/**
 * Resolves organic Play Store rank for a tracked competitor package in one market.
 * Returns null when the competitor is not in the top 100.
 */
export function resolveTrackedCompetitorMatchInSerp(
  results: readonly SerperCountryResultForSnapshot[],
  competitorPkg: string | null | undefined,
  country: string,
  displayName?: string | null,
  canonicalPackageId?: string | null,
  serpMatchedPackageId?: string | null,
): SerperRankMatchResult {
  const want = normPkgForSerperSnapshot(competitorPkg);
  if (!want) return { rank: null, matchKind: "none", matchScore: null };

  const resolvedDisplay = resolveConfiguredCompetitorDisplayName(displayName, competitorPkg!);
  return resolveRankMatchInCountryForSerperSnapshot(results, competitorPkg!, country, {
    displayName: resolvedDisplay,
    canonicalPackageId,
    serpMatchedPackageId,
    bestEffortTitleMatch: true,
  });
}

export function resolveTrackedCompetitorRankInSerp(
  results: readonly SerperCountryResultForSnapshot[],
  competitorPkg: string | null | undefined,
  country: string,
  displayName?: string | null,
  canonicalPackageId?: string | null,
  serpMatchedPackageId?: string | null,
): number | null {
  const { rank } = resolveTrackedCompetitorMatchInSerp(
    results,
    competitorPkg,
    country,
    displayName,
    canonicalPackageId,
    serpMatchedPackageId,
  );
  if (rank == null || rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return null;
  return rank;
}

export function resolveConfiguredCompetitorSlot(
  results: readonly SerperCountryResultForSnapshot[],
  slot: ConfiguredCompetitorSlot,
  competitor: TrackedCompetitorRef,
  country: string,
): ResolvedConfiguredCompetitor | null {
  const packageId = normPkgForSerperSnapshot(competitor.package_name);
  if (!packageId) return null;

  const displayName = resolveConfiguredCompetitorDisplayName(
    competitor.name,
    packageId,
  );
  const match = resolveTrackedCompetitorMatchInSerp(
    results,
    packageId,
    country,
    displayName,
    competitor.canonical_package_id,
    competitor.serp_matched_package_id,
  );
  const rank =
    match.rank != null && match.rank < SERPER_RANK_NOT_IN_FIRST_PAGE ? match.rank : null;

  return {
    slot,
    packageId,
    displayName,
    initial: competitorInitialForDisplay(
      displayName,
      packageId,
      match.matchedSerpTitle,
    ),
    iconUrl: competitor.icon_url?.trim() || null,
    rank,
    rankText: formatTrackedCompetitorRankForDb(rank),
    matchKind: match.matchKind,
    matchScore: match.matchScore,
    matchedPackageId: match.matchedPackageId,
    matchedSerpTitle: match.matchedSerpTitle,
  };
}

/**
 * Map of package_name → rank for vault `tracked_competitor_ranks`.
 */
export function buildTrackedCompetitorRanksMap(
  competitors: readonly TrackedCompetitorRef[],
  results: readonly SerperCountryResultForSnapshot[],
  country: string,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const comp of competitors) {
    const pkg = normPkgForSerperSnapshot(comp.package_name);
    if (!pkg) continue;
    out[pkg] = resolveTrackedCompetitorRankInSerp(
      results,
      comp.package_name,
      country,
      comp.name,
      comp.canonical_package_id,
      comp.serp_matched_package_id,
    );
  }
  return out;
}

/** Debug log shape — only user-selected Competitor Spy apps, never generic SERP leaders. */
export type TrackedCompetitorResolutionLog = {
  name: string | null;
  package_name: string;
  rank: number | null;
  match_kind: SerperRankMatchKind;
  match_score: number | null;
};

export function summarizeTrackedCompetitorResolution(
  competitors: readonly TrackedCompetitorRef[],
  results: readonly SerperCountryResultForSnapshot[],
  country: string,
): { serp_play_app_count: number; competitors: TrackedCompetitorResolutionLog[] } {
  const cc = String(country ?? "").trim().toLowerCase();
  const block = results.find((r) => String(r.country ?? "").trim().toLowerCase() === cc);

  if (!block || block.error) {
    return {
      serp_play_app_count: 0,
      competitors: competitors.map((c) => ({
        name: c.name ?? null,
        package_name: normPkgForSerperSnapshot(c.package_name) ?? c.package_name,
        rank: null,
        match_kind: "none" as const,
        match_score: null,
      })),
    };
  }

  const competitorsLog = competitors.map((comp) => {
    const pkg = normPkgForSerperSnapshot(comp.package_name);
    if (!pkg) {
      return {
        name: comp.name ?? null,
        package_name: comp.package_name,
        rank: null,
        match_kind: "none" as const,
        match_score: null,
      };
    }
    const lookup = serpLookupForPackage(
      comp.package_name,
      comp.canonical_package_id,
      comp.serp_matched_package_id,
    );
    const { rank, matchKind, matchScore } = findBestRankInSerpItems(
      block.items,
      lookup.serpLookupPackageId,
      {
        displayName: normalizeCompetitorDisplayNameForRank(comp.name) ?? comp.name,
      },
    );
    const clientRank =
      rank != null && rank < SERPER_RANK_NOT_IN_FIRST_PAGE ? rank : null;
    return {
      name: comp.name ?? null,
      package_name: pkg,
      rank: clientRank,
      match_kind: matchKind,
      match_score: matchScore,
    };
  });

  return { serp_play_app_count: block.items.length, competitors: competitorsLog };
}

export function trackedCompetitorRanksMapToSnapshots(
  competitors: readonly TrackedCompetitorRef[],
  ranksMap: Record<string, number | null>,
): TrackedCompetitorRankSnapshot[] {
  return competitors
    .map((comp) => {
      const pkg = normPkgForSerperSnapshot(comp.package_name);
      if (!pkg) return null;
      return {
        package_name: pkg,
        name: comp.name ?? null,
        rank: ranksMap[pkg] ?? null,
      };
    })
    .filter((x): x is TrackedCompetitorRankSnapshot => x != null);
}
