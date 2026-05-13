import "server-only";

import { normalizeCountries } from "@/lib/serper";
import { isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";

import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

/** Subset of the Serper preview JSON used to compute a stored rank. */
export type SerperCountryResultForSnapshot = {
  country: string;
  error: string | null;
  items: readonly { packageId: string | null; position: number }[];
};

function normPkg(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  const t = id.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function normMarket(m: string): string {
  return String(m ?? "").trim().toLowerCase();
}

/**
 * Resolves a single integer rank for `keyword_rank_snapshots.rank`:
 * prefer the app's position in **primaryMarket**; else best (minimum) position
 * across countries; else {@link SERPER_RANK_NOT_IN_FIRST_PAGE}.
 *
 * There is no per-country column on snapshots — multi-country Serper runs fold
 * into one row using this rule.
 */
export function resolveRankForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  primaryMarket: string,
): number {
  const want = normPkg(packageName);
  if (!want) return SERPER_RANK_NOT_IN_FIRST_PAGE;

  const primary = normMarket(primaryMarket);
  let primaryHit: number | undefined;
  const others: number[] = [];

  for (const block of results) {
    if (block.error) continue;
    const country = normMarket(block.country);
    for (const item of block.items) {
      const pkg = normPkg(item.packageId);
      if (pkg !== want) continue;
      if (country === primary) {
        if (primaryHit === undefined) primaryHit = item.position;
      } else {
        others.push(item.position);
      }
    }
  }

  if (primaryHit != null) return primaryHit;
  const pool = others;
  if (pool.length === 0) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  return Math.min(...pool);
}

/** Maps `apps.target_countries` (e.g. `US`) to Serper codes; falls back to keyword market. */
export function serperCountriesForKeywordRefresh(params: {
  keywordMarket: string;
  targetCountries: string[] | null | undefined;
}): SupportedCountryCode[] {
  const fromApp = (params.targetCountries ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => isSupportedCountry(c)) as SupportedCountryCode[];

  const normalized = normalizeCountries(fromApp.length > 0 ? fromApp : [params.keywordMarket]);
  return normalized.length > 0 ? normalized : normalizeCountries(["us"]);
}
