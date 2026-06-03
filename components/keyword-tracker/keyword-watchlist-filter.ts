import { isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";

/** Markets shown as watchlist filter chips (includes “All” in UI, not listed here). */
export const WATCHLIST_MARKET_FILTER_CODES = [
  "us",
  "sa",
  "ae",
  "in",
  "cn",
] as const satisfies readonly SupportedCountryCode[];

/**
 * Country chip filter: a row matches when **any** selected market is present in
 * `latestPerCountry` snapshot keys, `trackedCountryCodes`, or equals the keyword’s
 * `market` (primary market on the keywords row). Empty selection = show all rows.
 */
export function keywordRowMatchesCountryFilter(
  row: KeywordWithRanks,
  selectedMarkets: ReadonlySet<SupportedCountryCode>,
): boolean {
  if (selectedMarkets.size === 0) return true;

  const market = String(row.market ?? "").trim().toLowerCase();
  if (isSupportedCountry(market) && selectedMarkets.has(market)) return true;

  for (const code of row.trackedCountryCodes ?? []) {
    if (selectedMarkets.has(code)) return true;
  }

  for (const entry of row.latestPerCountry ?? []) {
    if (selectedMarkets.has(entry.country)) return true;
  }

  return false;
}

export function filterKeywordsBySearch(
  rows: KeywordWithRanks[],
  query: string,
  appNameById: ReadonlyMap<string, string>,
): KeywordWithRanks[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (row.term.toLowerCase().includes(q)) return true;
    const app = (appNameById.get(row.app_id) ?? "").toLowerCase();
    return app.length > 0 && app.includes(q);
  });
}
