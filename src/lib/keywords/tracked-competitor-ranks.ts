import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import {
  findBestRankInSerpItems,
  normalizeCompetitorDisplayNameForRank,
  normPkgForSerperSnapshot,
  type SerperCountryResultForSnapshot,
  type SerperRankMatchKind,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

export type TrackedCompetitorRef = {
  package_name: string;
  name?: string | null;
};

export type TrackedCompetitorRankSnapshot = {
  package_name: string;
  name?: string | null;
  /** Organic SERP position; null when not in top 100. */
  rank: number | null;
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
export function resolveTrackedCompetitorRankInSerp(
  results: readonly SerperCountryResultForSnapshot[],
  competitorPkg: string | null | undefined,
  country: string,
  displayName?: string | null,
): number | null {
  const want = normPkgForSerperSnapshot(competitorPkg);
  if (!want) return null;

  const cc = String(country ?? "").trim().toLowerCase();
  const block = results.find((r) => String(r.country ?? "").trim().toLowerCase() === cc);
  if (!block || block.error) return null;

  const { rank } = findBestRankInSerpItems(block.items, want, {
    displayName: normalizeCompetitorDisplayNameForRank(displayName),
  });
  if (rank == null || rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return null;
  return rank;
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
    out[pkg] = resolveTrackedCompetitorRankInSerp(results, pkg, country, comp.name);
  }
  return out;
}

/** Debug log shape — only user-selected Competitor Spy apps, never generic SERP leaders. */
export type TrackedCompetitorResolutionLog = {
  name: string | null;
  package_name: string;
  rank: number | null;
  match_kind: SerperRankMatchKind;
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
      };
    }
    const { rank, matchKind } = findBestRankInSerpItems(block.items, pkg, {
      displayName: normalizeCompetitorDisplayNameForRank(comp.name),
    });
    const clientRank =
      rank != null && rank < SERPER_RANK_NOT_IN_FIRST_PAGE ? rank : null;
    return {
      name: comp.name ?? null,
      package_name: pkg,
      rank: clientRank,
      match_kind: matchKind,
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
