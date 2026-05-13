/**
 * Shared supported Play Store market country codes (lowercase).
 *
 * This module is intentionally **not** `server-only` so it can be imported from
 * client components (e.g. `CountrySelector`). Server-side search wiring lives
 * in `lib/serper.ts` (`server-only`).
 *
 * Adding a country here? Also update:
 *   1. `COUNTRY_LOCALE_MAP` in `lib/serper.ts`
 *   2. `messages/{en,ar}.json` → `countrySelector.countries.<code>`
 */

export const SUPPORTED_COUNTRY_CODES = ["us", "sa", "ae"] as const;

export type SupportedCountryCode = (typeof SUPPORTED_COUNTRY_CODES)[number];

/** Hard cap on countries per multi-market search call. */
export const SERPER_MAX_COUNTRIES = 3;

/** Flag emoji for supported markets (keep in sync with `countrySelector.countries.*.flag`). */
export const COUNTRY_FLAG_EMOJI: Record<SupportedCountryCode, string> = {
  us: "🇺🇸",
  sa: "🇸🇦",
  ae: "🇦🇪",
};

export function isSupportedCountry(code: string): code is SupportedCountryCode {
  return (SUPPORTED_COUNTRY_CODES as readonly string[]).includes(code);
}

/**
 * Up to three supported codes for UI chips: prefer `apps.target_countries`,
 * else the keyword's single `market`.
 */
export function countriesForKeywordRankChips(params: {
  market: string;
  targetCountries?: string[] | null;
}): SupportedCountryCode[] {
  const fromApp = (params.targetCountries ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c): c is SupportedCountryCode => isSupportedCountry(c));
  const unique = Array.from(new Set(fromApp));
  if (unique.length > 0) return unique.slice(0, SERPER_MAX_COUNTRIES);

  const m = String(params.market ?? "").trim().toLowerCase();
  if (isSupportedCountry(m)) return [m];
  return [];
}

/** Primary market for copy/tooltips when a keyword has a stored `market`. */
export function primaryMarketCode(market: string): SupportedCountryCode | null {
  const m = String(market ?? "").trim().toLowerCase();
  return isSupportedCountry(m) ? m : null;
}
