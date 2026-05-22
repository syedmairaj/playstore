/** Supported review market + language pairs (Play Console–style). */
export const REVIEW_MARKET_LOCALES = ["us-en", "ae-ar", "in-hi"] as const;

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
  locale: ReviewMarketLocale;
  text: string;
  dateIso: string;
  classifications: ReviewClassification[];
};

export type StarFilter = "all" | "5" | "4" | "3" | "2" | "1";

export type LocaleFilter = "all" | ReviewMarketLocale;

export type ClassificationFilter = "all" | ReviewClassification;

export function localeToCountryCode(locale: ReviewMarketLocale): "us" | "ae" | "in" {
  if (locale === "ae-ar") return "ae";
  if (locale === "in-hi") return "in";
  return "us";
}

export function localeToReplyLanguage(locale: ReviewMarketLocale): "en" | "ar" | "hi" {
  if (locale === "ae-ar") return "ar";
  if (locale === "in-hi") return "hi";
  return "en";
}
