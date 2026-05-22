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
  /**
   * ISO timestamp of the most recent rank snapshot for this keyword × country.
   * null means the keyword has never been fetched (Brand New state).
   * Used to derive freshness: stale when > RANK_STALE_DAYS old.
   */
  capturedAt: string | null;
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
          capturedAt: entry.captured_at ?? null,
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
        capturedAt: kw.latest?.captured_at ?? null,
      });
    }
  }

  return out;
}

/** Number of days after which a rank snapshot is considered stale. */
export const RANK_STALE_DAYS = 7;

/**
 * Three-state freshness descriptor for a keyword row's rank data.
 *
 * - `"new"`   — no snapshot ever taken (capturedAt is null)
 * - `"fresh"` — snapshot exists and is < RANK_STALE_DAYS old
 * - `"stale"` — snapshot exists but is ≥ RANK_STALE_DAYS old
 */
export type RankFreshness = "new" | "fresh" | "stale";

/**
 * Returns the freshness state of a flat keyword row.
 * Pure function — no side effects, safe to call in render.
 */
export function getRankFreshness(capturedAt: string | null): RankFreshness {
  if (!capturedAt) return "new";
  const ageMs = Date.now() - new Date(capturedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays >= RANK_STALE_DAYS ? "stale" : "fresh";
}

/**
 * Returns a human-readable relative age string for display in the "Updated X ago" label.
 * e.g. "2h ago", "3d ago", "just now"
 */
export function formatCapturedAgo(capturedAt: string): string {
  const ageMs = Date.now() - new Date(capturedAt).getTime();
  const mins = Math.floor(ageMs / (1000 * 60));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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
