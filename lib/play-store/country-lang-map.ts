/**
 * country-lang-map.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the gl (geography) → hl[] (interface language)
 * mapping used when fetching Google Play Store reviews.
 *
 * Design decisions
 * ─────────────────
 * India ("in"):
 *   The Play Store's English storefront (`hl=en`) is the dominant surface for
 *   developer-visible reviews in India.  `hl=hi` returns reviews written in
 *   Devanagari script, which are far fewer and are not useful for the English-
 *   language ASO copywriting pipeline.  A single `en` pass is correct here.
 *
 * UAE ("ae"):
 *   The UAE storefront is genuinely bilingual: English-language reviews dominate
 *   tech apps, but significant Arabic-language review volume exists for consumer
 *   and lifestyle apps.  Both passes are required to get a representative sample.
 *   They are executed concurrently and deduplicated by review ID before merging.
 *
 * Saudi Arabia ("sa"):
 *   Same bilingual profile as UAE — kept as a parallel entry for completeness.
 *
 * All other countries:
 *   Default to a single English pass.  Callers that need an explicit override
 *   (e.g. Brazil → "pt") should extend COUNTRY_LANG_MAP directly.
 *
 * Usage
 * ──────
 * ```ts
 * import { getHlsForCountry } from "@/lib/play-store/country-lang-map";
 * const hls = getHlsForCountry("ae"); // ["en", "ar"]
 * ```
 */

/**
 * Ordered list of BCP 47 language tags (hl values) to use for a given
 * ISO 3166-1 alpha-2 country code (gl value).
 *
 * - Single-entry arrays → one scraper pass.
 * - Multi-entry arrays  → concurrent passes merged + deduplicated.
 */
export const COUNTRY_LANG_MAP: Readonly<Record<string, readonly string[]>> = {
  // ── Asia Pacific ──────────────────────────────────────────────────────────
  in: ["en"],        // India — English is the dominant ASO-relevant surface
  jp: ["ja"],        // Japan
  kr: ["ko"],        // South Korea
  cn: ["zh-CN"],     // China (GPlay not available; kept for completeness)
  tw: ["zh-TW"],     // Taiwan
  th: ["th"],        // Thailand
  vn: ["vi"],        // Vietnam
  id: ["id"],        // Indonesia

  // ── Middle East / MENA ────────────────────────────────────────────────────
  ae: ["en", "ar"],  // UAE — bilingual; concurrent dual-pass fetch
  sa: ["en", "ar"],  // Saudi Arabia — same bilingual profile as UAE
  eg: ["ar"],        // Egypt
  tr: ["tr"],        // Turkey

  // ── Europe ────────────────────────────────────────────────────────────────
  de: ["de"],        // Germany
  fr: ["fr"],        // France
  es: ["es"],        // Spain
  it: ["it"],        // Italy
  nl: ["nl"],        // Netherlands
  pl: ["pl"],        // Poland
  ru: ["ru"],        // Russia
  pt: ["pt-PT"],     // Portugal
  se: ["sv"],        // Sweden
  no: ["no"],        // Norway
  dk: ["da"],        // Denmark
  fi: ["fi"],        // Finland

  // ── Americas ──────────────────────────────────────────────────────────────
  us: ["en"],        // United States
  gb: ["en"],        // United Kingdom
  au: ["en"],        // Australia
  ca: ["en"],        // Canada
  br: ["pt-BR"],     // Brazil
  mx: ["es"],        // Mexico
  ar: ["es"],        // Argentina
  co: ["es"],        // Colombia
} as const;

/** Fallback when a country code is absent from COUNTRY_LANG_MAP. */
const DEFAULT_HLS: readonly string[] = ["en"];

/**
 * Returns the ordered list of `hl` (interface language) codes to use when
 * scraping Google Play reviews for the given `gl` (geography) country code.
 *
 * - Always returns at least one entry.
 * - Multi-entry results must be fetched concurrently and their reviews
 *   deduplicated before merging into the output stream.
 *
 * @param gl ISO 3166-1 alpha-2 country code (case-insensitive).
 * @returns Readonly array of BCP 47 language tags, e.g. `["en", "ar"]`.
 */
export function getHlsForCountry(gl: string): readonly string[] {
  const key = gl.trim().toLowerCase();
  return COUNTRY_LANG_MAP[key] ?? DEFAULT_HLS;
}

/**
 * Returns true when the given country requires more than one language pass
 * (i.e. concurrent dual-pass fetch + deduplication is needed).
 */
export function isMultiLangCountry(gl: string): boolean {
  return getHlsForCountry(gl).length > 1;
}
