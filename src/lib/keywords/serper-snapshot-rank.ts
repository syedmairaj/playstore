import "server-only";

import { normalizeCountries } from "@/lib/serper";
import { isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";

export {
  type SerperCountryResultForSnapshot,
  type SerperRankResolveOptions,
  type LiveRankNotRankedReason,
  LIVE_RANK_VISIBILITY_CEILING,
  resolveRankForSerperSnapshot,
  resolveRankInCountryForSerperSnapshot,
  rankForClientDisplay,
  rankForSnapshotInsert,
  applyLiveRankClientPolicy,
  formatSerperTopResultsForLog,
  formatSerperTopResultsWithMatchScores,
  findBestRankInSerpItems,
  buildSerpRankDebugPayload,
  logPoorSerpRankDebug,
  resolveRankMatchInCountryForSerperSnapshot,
  scoreTitleMatchAgainstTarget,
  TITLE_SIMILARITY_THRESHOLD,
  serpLookupForPackage,
  logSerpTargetMatchResult,
  warnWhenMissingCanonicalPackageId,
  isLikelyNonProductionPackageId,
  isRankMatchEstablished,
  BEST_EFFORT_TITLE_SIMILARITY_THRESHOLD,
  type SerpPackageLookup,
  type SerpLookupSource,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

/**
 * Maps persisted snapshot markets, then `apps.target_countries`, then `keywordMarket`.
 * Dedupes and caps at {@link SERPER_MAX_COUNTRIES} via {@link normalizeCountries}.
 */
export function serperCountriesForKeywordRefresh(params: {
  keywordMarket: string;
  targetCountries: string[] | null | undefined;
  /** Distinct `keyword_rank_snapshots.country_code` values for this keyword (any order). */
  snapshotCountryCodes?: string[] | null | undefined;
}): SupportedCountryCode[] {
  const mktRaw = String(params.keywordMarket ?? "us").trim().toLowerCase() || "us";
  const fromSnaps = (params.snapshotCountryCodes ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c): c is SupportedCountryCode => isSupportedCountry(c));

  if (fromSnaps.length > 0) {
    const normalized = normalizeCountries(fromSnaps);
    return normalized.length > 0 ? normalized : normalizeCountries(["us"]);
  }

  const fromApp = (params.targetCountries ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => isSupportedCountry(c)) as SupportedCountryCode[];

  const merged: string[] = fromApp.length > 0 ? [...fromApp, mktRaw] : [mktRaw];
  const normalized = normalizeCountries(merged);
  return normalized.length > 0 ? normalized : normalizeCountries(["us"]);
}
