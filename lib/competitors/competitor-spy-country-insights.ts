import type { StoredCompetitor } from "@/lib/competitors/normalize-stored-competitor";
import { isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";
import {
  buildCompetitorSpyAnalysisFromPreview,
  filterSharedRowsBothSidesTracked,
  type BuiltCompetitorSpyAnalysis,
  type TrackedKeywordRankHint,
  yourRankForCompetitorSpyDisplay,
} from "@/lib/keywords/build-competitor-spy-from-serper-preview";
import {
  effectiveSerperPreviewItemPackage,
  normPkgForSerperSnapshot,
} from "@/lib/keywords/serper-snapshot-rank-resolve";
import type { SerperPreviewCountry } from "@/lib/keywords/serper-preview-types";

export function normalizePreviewCountryCode(country: string): SupportedCountryCode | null {
  const c = String(country ?? "").trim().toLowerCase();
  return isSupportedCountry(c) ? c : null;
}

export function filterSerperPreviewByCountry(
  results: SerperPreviewCountry[] | null | undefined,
  country: SupportedCountryCode,
): SerperPreviewCountry[] {
  if (!results?.length) return [];
  return results.filter((b) => normalizePreviewCountryCode(b.country) === country);
}

/** True when preview includes a result block for the market (even if Serper errored). */
export function previewHasCountryBlock(
  results: SerperPreviewCountry[] | null | undefined,
  country: SupportedCountryCode,
): boolean {
  return filterSerperPreviewByCountry(results, country).length > 0;
}

export function buildCompetitorSpyInsightsForCountry(input: {
  competitor: StoredCompetitor;
  previewResults: SerperPreviewCountry[] | null | undefined;
  country: SupportedCountryCode;
  workspacePackage: string | null | undefined;
  trackedKeywords?: TrackedKeywordRankHint[];
}): BuiltCompetitorSpyAnalysis | null {
  const filtered = filterSerperPreviewByCountry(input.previewResults, input.country);
  if (!filtered.length) return null;
  const built = buildCompetitorSpyAnalysisFromPreview({
    query: input.competitor.query,
    results: filtered,
    workspacePackage: input.workspacePackage,
    trackedKeywords: input.trackedKeywords,
  });
  if (!built) return null;
  return {
    ...built,
    shared: filterSharedRowsBothSidesTracked(built.shared),
  };
}

export type CompetitorSpyCountryGapRow = {
  keyword: string;
  opportunity: "high" | "medium";
  yourRank: number | null;
  competitorRank: number | null;
};

export function gapRowsForCompetitorCountry(
  comp: StoredCompetitor | null,
  countryInsights: BuiltCompetitorSpyAnalysis | null,
): CompetitorSpyCountryGapRow[] {
  if (!comp) return [];
  const gaps = countryInsights?.gaps ?? comp.gaps;
  const shared = countryInsights?.shared ?? comp.shared;
  const sharedByKw = new Map(shared.map((s) => [s.keyword.toLowerCase(), s]));
  return gaps
    .map((g) => {
      const sh = sharedByKw.get(g.keyword.toLowerCase());
      return {
        keyword: g.keyword,
        opportunity: g.opportunity,
        yourRank: yourRankForCompetitorSpyDisplay(sh?.yourRank ?? null),
        competitorRank: sh?.theirRank ?? null,
      };
    })
    .sort((a, b) => a.keyword.localeCompare(b.keyword));
}

export function minPreviewRankForPackageInResults(
  results: SerperPreviewCountry[] | null | undefined,
  packageId: string,
): number | null {
  if (!results?.length) return null;
  const want = normPkgForSerperSnapshot(packageId);
  if (!want) return null;
  let best: number | null = null;
  for (const block of results) {
    if (block.error) continue;
    for (const it of block.items) {
      const pid = effectiveSerperPreviewItemPackage(it);
      if (!pid || pid !== want) continue;
      if (best === null || it.position < best) best = it.position;
    }
  }
  return best;
}

export function liveTitleFromPreviewInResults(
  results: SerperPreviewCountry[] | null | undefined,
  packageId: string,
): string | null {
  if (!results?.length) return null;
  const want = normPkgForSerperSnapshot(packageId);
  if (!want) return null;
  for (const block of results) {
    if (block.error) continue;
    for (const it of block.items) {
      const pid = effectiveSerperPreviewItemPackage(it);
      if (pid === want && it.title.trim()) return it.title.trim();
    }
  }
  return null;
}
