/** Supported review market + language pairs (Play Console–style). */
export const REVIEW_MARKET_LOCALES = ["us-en", "ae-ar", "in-hi", "ae-en"] as const;

export type ReviewMarketLocale = (typeof REVIEW_MARKET_LOCALES)[number];

export type ReviewClassification =
  | "bug_crash"
  | "feature_request"
  | "pricing"
  | "praise";

export type ReviewRow = {
  id: string;
  userName: string;
  rating: number;
  appVersion: string;
  /**
   * Play Console–style market+language locale tag.
   * Used for the locale filter dropdown in the review feed.
   */
  locale: ReviewMarketLocale;
  text: string;
  dateIso: string;
  classifications: ReviewClassification[];
  /**
   * BCP 47 language tag of the scraper pass that produced this review
   * (e.g. "en", "ar", "ja").
   *
   * This field enables downstream partitioning by language:
   *   - The Common Issues NLP engine uses (workspace_id + package_name + langCode)
   *     as a composite key so English-language insights and Arabic-language
   *     insights are stored, cached, and displayed on their correct dashboard tabs.
   *   - For countries that require a single hl pass (e.g. India "in"→["en"]),
   *     all reviews carry langCode="en".
   *   - For dual-pass countries (e.g. UAE "ae"→["en","ar"]), reviews from the
   *     Arabic pass carry langCode="ar" and reviews from the English pass carry
   *     langCode="en", even after the two arrays are merged and deduplicated.
   */
  langCode: string;
};

export type StarFilter = "all" | "5" | "4" | "3" | "2" | "1";

export type LocaleFilter = "all" | ReviewMarketLocale;

export type ClassificationFilter = "all" | ReviewClassification;

export function localeToCountryCode(locale: ReviewMarketLocale): "us" | "ae" | "in" {
  if (locale === "ae-ar" || locale === "ae-en") return "ae";
  if (locale === "in-hi") return "in";
  return "us";
}

export function localeToReplyLanguage(locale: ReviewMarketLocale): "en" | "ar" | "hi" {
  if (locale === "ae-ar") return "ar";
  if (locale === "in-hi") return "hi";
  return "en";
}
