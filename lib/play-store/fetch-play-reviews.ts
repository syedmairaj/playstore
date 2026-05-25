import "server-only";
import gplay from "google-play-scraper";
import type { ReviewMarketLocale, ReviewRow } from "@/components/reviews/reviews-types";
import { getHlsForCountry } from "@/lib/play-store/country-lang-map";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw review fields produced by the scraper, before mapping to ReviewRow. */
export type FetchedPlayReview = {
  id: string;
  userName: string;
  rating: number;
  text: string;
  appVersion: string;
  dateIso: string;
  /** ISO 3166-1 alpha-2 country code (gl) used for this scraper call. */
  country: string;
  /** BCP 47 language tag (hl) used for this scraper call. */
  lang: string;
};

export type FetchPlayReviewsOptions = {
  /** Android application id (package name), e.g. `com.example.app`. */
  appId: string;
  /**
   * ISO 3166-1 alpha-2 geography code (gl), e.g. "in", "ae", "us".
   * The corresponding hl values are resolved via getHlsForCountry() —
   * callers must NOT supply hl/lang directly; the library owns that decision.
   */
  country?: string;
  /**
   * Maximum reviews to return **per language pass**.
   * For dual-pass countries (e.g. UAE) the combined result may contain up to
   * 2 × num items before deduplication.
   */
  num?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCountry(country: string | undefined): string {
  const c = (country ?? "us").trim().toLowerCase();
  return c.length >= 2 ? c : "us";
}

function toDateIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return value.trim().slice(0, 10);
  }
  return new Date().toISOString();
}

function mapScraperItem(
  item: {
    id?: string;
    userName?: string;
    score?: number;
    text?: string;
    version?: string | null;
    date?: string | Date;
  },
  country: string,
  lang: string,
  index: number,
): FetchedPlayReview {
  const rating = typeof item.score === "number" ? Math.min(5, Math.max(1, item.score)) : 3;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  const id =
    typeof item.id === "string" && item.id.trim()
      ? item.id.trim()
      : `scraped-${country}-${lang}-${index}-${toDateIso(item.date).slice(0, 10)}`;

  return {
    id,
    userName:
      typeof item.userName === "string" && item.userName.trim()
        ? item.userName.trim()
        : "Anonymous",
    rating,
    text,
    appVersion:
      typeof item.version === "string" && item.version.trim()
        ? item.version.trim()
        : "—",
    dateIso: toDateIso(item.date),
    country,
    lang,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a (country, lang) pair to a Play Console–style ReviewMarketLocale token.
 *
 * Extended to handle the new "ae-en" locale introduced to distinguish
 * English-language UAE reviews from Arabic-language UAE reviews.
 */
export function countryLangToReviewLocale(
  country: string,
  lang: string,
): ReviewMarketLocale {
  const c = country.toLowerCase();
  const l = lang.toLowerCase();

  // Arabic script — any country, or explicitly Arabic hl
  if (l.startsWith("ar")) return "ae-ar";

  // UAE/Saudi with English hl — disambiguated locale
  if (c === "ae" || c === "sa") return "ae-en";

  // India — English is the single pass; return in-hi for backwards compat
  // with the locale filter label, but langCode="en" is carried on ReviewRow
  // so NLP can still correctly partition English-text reviews from India.
  if (c === "in") return "in-hi";

  return "us-en";
}

// ─────────────────────────────────────────────────────────────────────────────
// Row converter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw `FetchedPlayReview` into a `ReviewRow` ready for the UI.
 * The `langCode` field is preserved verbatim from the scraper pass so that
 * downstream consumers (Common Issues NLP, locale filter) can partition
 * strictly by language.
 */
export function fetchedPlayReviewToRow(
  review: FetchedPlayReview,
  classifications: ReviewRow["classifications"] = [],
): ReviewRow {
  return {
    id: review.id,
    userName: review.userName,
    rating: review.rating,
    appVersion: review.appVersion,
    locale: countryLangToReviewLocale(review.country, review.lang),
    text: review.text,
    dateIso: review.dateIso.slice(0, 10),
    classifications,
    langCode: review.lang,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-pass fetch (internal primitive)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches public Play Store reviews for a single (appId, country, hl) tuple.
 * On failure returns an empty array and logs — never throws.
 *
 * This is an internal primitive; external callers should use
 * {@link fetchPlayReviewsMultiLang} which handles hl resolution and
 * concurrent dual-pass deduplication automatically.
 */
async function fetchPlayReviewsSinglePass(
  appId: string,
  country: string,
  hl: string,
  num: number,
): Promise<FetchedPlayReview[]> {
  const lang = hl.trim().toLowerCase();
  try {
    const result = await gplay.reviews({ appId, country, lang, num });
    return (result.data ?? []).map((item, index) =>
      mapScraperItem(item, country, lang, index),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[fetchPlayReviews:single-pass]", { appId, country, lang, message });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-language concurrent fetcher (public API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches Google Play Store reviews for the given app, automatically resolving
 * the correct hl (interface language) values for the supplied gl (geography)
 * country code via `getHlsForCountry`.
 *
 * ## Multi-language countries (e.g. UAE "ae" → ["en", "ar"])
 * - Both language passes are executed **concurrently** via `Promise.all()`.
 * - The resulting arrays are merged into a single stream.
 * - A deduplication pass over `review.id` ensures no review appears twice even
 *   if the Play Store returns the same item for both hl values.
 * - Each item retains its `lang` field so downstream consumers can partition
 *   English insights from Arabic insights without losing provenance.
 *
 * ## Single-language countries (e.g. India "in" → ["en"])
 * - A single scraper call is made — no overhead vs. the old implementation.
 *
 * ## Item count
 * - `num` controls reviews **per language pass**.  For a dual-pass country the
 *   merged result can contain up to 2 × num unique items.
 *
 * @param options.appId   Android package name, e.g. `com.example.app`.
 * @param options.country ISO 3166-1 alpha-2 gl code, e.g. `"ae"`.  Defaults to `"us"`.
 * @param options.num     Reviews per pass (1–200).  Defaults to 100.
 * @returns Deduplicated array of `FetchedPlayReview`, each carrying `lang` provenance.
 */
export async function fetchPlayReviewsMultiLang(
  options: FetchPlayReviewsOptions,
): Promise<FetchedPlayReview[]> {
  const appId = options.appId.trim();
  if (!appId) return [];

  const country = normalizeCountry(options.country);
  const num = Math.min(Math.max(options.num ?? 100, 1), 200);

  // Resolve the ordered hl[] for this gl value.
  const hls = getHlsForCountry(country);

  // ── Concurrent multi-pass fetch ────────────────────────────────────────────
  // Each hl fires independently so a slow Arabic scraper node doesn't block
  // the English results from returning.
  const passResults = await Promise.all(
    hls.map((hl) => fetchPlayReviewsSinglePass(appId, country, hl, num)),
  );

  // ── Merge + deduplicate by review ID ──────────────────────────────────────
  // The dedup set tracks seen IDs in insertion order (first-pass wins).
  // For dual-pass countries this means: if the Play Store returns identical
  // review IDs for both hl=en and hl=ar (rare but documented), the English
  // version is kept because it arrived from the first pass in the hls array.
  const seen = new Set<string>();
  const merged: FetchedPlayReview[] = [];

  for (const passItems of passResults) {
    for (const item of passItems) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy single-lang export (kept for callers that pin a specific hl)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Prefer {@link fetchPlayReviewsMultiLang}.
 * This export is retained for any internal callers that were relying on the
 * old single-pass behaviour with an explicit `lang` override.  New code must
 * use `fetchPlayReviewsMultiLang` so the country-lang map is respected.
 */
export async function fetchPlayReviews(
  options: FetchPlayReviewsOptions & { lang?: string },
): Promise<FetchedPlayReview[]> {
  const appId = options.appId.trim();
  if (!appId) return [];

  const country = normalizeCountry(options.country);
  // If an explicit lang was passed, honour it (legacy behaviour).
  // Otherwise fall back to the first hl for this country.
  const lang = options.lang?.trim().toLowerCase() ?? getHlsForCountry(country)[0] ?? "en";
  const num = Math.min(Math.max(options.num ?? 100, 1), 200);

  return fetchPlayReviewsSinglePass(appId, country, lang, num);
}
