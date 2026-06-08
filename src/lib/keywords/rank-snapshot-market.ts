import { isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";

/**
 * Maps `keywords.market` to a supported Play country code when possible
 * (e.g. `en-US` → `us`). Used so per-country snapshots are not hidden when
 * `market` was stored as a locale-style tag instead of alpha-2.
 */
export function keywordMarketToPlayCountryCode(market: string): SupportedCountryCode | null {
  const m = String(market ?? "").trim().toLowerCase();
  if (isSupportedCountry(m)) return m;
  const tag = m.replace(/_/g, "-");
  try {
    const loc = new Intl.Locale(tag);
    const r = loc.region?.toLowerCase();
    if (r && isSupportedCountry(r)) return r;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * When `keyword_rank_snapshots.country_code` is set, history for a keyword shows
 * only rows for that keyword's resolved Play market. Legacy rows with NULL `country_code`
 * remain visible (pre–per-market tagging). If `market` cannot be mapped to a supported
 * country, tagged rows are not filtered out (avoids an empty tracker after Serper saves).
 */
export function rankSnapshotRowMatchesKeywordMarket(
  countryCode: string | null | undefined,
  keywordMarket: string,
): boolean {
  const target = keywordMarketToPlayCountryCode(keywordMarket);
  const raw = countryCode == null ? "" : String(countryCode).trim().toLowerCase();
  if (raw.length === 0) return true;
  if (target == null) return true;
  return raw === target;
}
