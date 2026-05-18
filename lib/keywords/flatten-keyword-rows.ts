import { isSupportedCountry, primaryMarketCode, type SupportedCountryCode } from "@/lib/countries";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";

/**
 * A single-market view of a tracked keyword row.
 * The table renders one `FlatKeywordRow` per country so each cell
 * contains exactly one market badge and one rank value.
 */
export type FlatKeywordRow = {
  /** Stable unique key for React: `${keyword.id}:${country}` */
  key: string;
  /** The original DB keyword row (for actions, history, delete, etc.) */
  source: KeywordWithRanks;
  /** The single country this flat row represents. */
  country: SupportedCountryCode;
  /**
   * Your app's rank for this keyword in `country`.
   * Sourced from `latestPerCountry` when available, otherwise `source.latest?.rank`.
   * null means no snapshot data for this country yet.
   */
  yourRank: number | null;
};

/**
 * Explodes a `KeywordWithRanks[]` into one `FlatKeywordRow` per tracked country.
 *
 * - If `latestPerCountry` has entries, emit one row per entry (ordered by country code).
 * - If `latestPerCountry` is empty/absent, fall back to a single row whose country is
 *   derived from `keyword.market` (or null-coalesced to "us").  This ensures keywords
 *   that have never been synced still appear in the table.
 *
 * `competitorRankByTerm` is intentionally NOT merged here — it is injected in the
 * table cell directly from the map prop so it stays reactive to async competitor fetches.
 */
export function flattenKeywordsToRows(
  keywords: KeywordWithRanks[],
): FlatKeywordRow[] {
  const out: FlatKeywordRow[] = [];

  for (const kw of keywords) {
    const perCountry = kw.latestPerCountry;

    if (perCountry && perCountry.length > 0) {
      // One row per country that has a snapshot
      for (const entry of perCountry) {
        out.push({
          key: `${kw.id}:${entry.country}`,
          source: kw,
          country: entry.country,
          yourRank: typeof entry.rank === "number" ? entry.rank : null,
        });
      }
    } else {
      // Fallback: derive country from keyword.market
      const rawMarket = String(kw.market ?? "").trim().toLowerCase();
      const fallbackCountry: SupportedCountryCode = isSupportedCountry(rawMarket)
        ? rawMarket
        : (primaryMarketCode(rawMarket) ?? "us");

      out.push({
        key: `${kw.id}:${fallbackCountry}`,
        source: kw,
        country: fallbackCountry,
        yourRank: kw.latest?.rank ?? null,
      });
    }
  }

  return out;
}

/**
 * Filter a FlatKeywordRow[] by a set of selected market codes.
 * Empty set = show all.
 */
export function filterFlatRowsByMarket(
  rows: FlatKeywordRow[],
  selectedMarkets: ReadonlySet<SupportedCountryCode>,
): FlatKeywordRow[] {
  if (selectedMarkets.size === 0) return rows;
  return rows.filter((r) => selectedMarkets.has(r.country));
}

/**
 * Search filter for flat rows: matches keyword term or app name.
 */
export function filterFlatRowsBySearch(
  rows: FlatKeywordRow[],
  query: string,
  appNameById: ReadonlyMap<string, string>,
): FlatKeywordRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    if (r.source.term.toLowerCase().includes(q)) return true;
    const app = (appNameById.get(r.source.app_id) ?? "").toLowerCase();
    return app.length > 0 && app.includes(q);
  });
}
