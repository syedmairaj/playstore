import "server-only";
import gplay from "google-play-scraper";
import type { ReviewMarketLocale, ReviewRow } from "@/components/reviews/reviews-types";

/** Raw review fields from the public Play Store scraper, aligned with dashboard needs. */
export type FetchedPlayReview = {
  id: string;
  userName: string;
  rating: number;
  text: string;
  appVersion: string;
  dateIso: string;
  country: string;
  lang: string;
};

export type FetchPlayReviewsOptions = {
  /** Android application id (package name), e.g. `com.example.app`. */
  appId: string;
  country?: string;
  lang?: string;
  num?: number;
};

function defaultLangForCountry(country: string): string {
  const c = country.toLowerCase();
  if (c === "ae" || c === "sa") return "ar";
  if (c === "in") return "hi";
  return "en";
}

function normalizeCountry(country: string | undefined): string {
  const c = (country ?? "us").trim().toLowerCase();
  return c.length === 2 ? c : "us";
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
      : `scraped-${country}-${index}-${toDateIso(item.date).slice(0, 10)}`;

  return {
    id,
    userName:
      typeof item.userName === "string" && item.userName.trim()
        ? item.userName.trim()
        : "Anonymous",
    rating,
    text,
    appVersion:
      typeof item.version === "string" && item.version.trim() ? item.version.trim() : "—",
    dateIso: toDateIso(item.date),
    country,
    lang,
  };
}

export function countryLangToReviewLocale(
  country: string,
  lang: string,
): ReviewMarketLocale {
  const c = country.toLowerCase();
  const l = lang.toLowerCase();
  if (c === "ae" || c === "sa" || l.startsWith("ar")) return "ae-ar";
  if (c === "in" || l.startsWith("hi")) return "in-hi";
  return "us-en";
}

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
  };
}

/**
 * Fetches public Play Store reviews via `google-play-scraper`.
 * On failure returns an empty array and logs (does not throw).
 */
export async function fetchPlayReviews(
  options: FetchPlayReviewsOptions,
): Promise<FetchedPlayReview[]> {
  const appId = options.appId.trim();
  if (!appId) return [];

  const country = normalizeCountry(options.country);
  const lang = (options.lang ?? defaultLangForCountry(country)).trim().toLowerCase();
  const num = Math.min(Math.max(options.num ?? 100, 1), 200);

  try {
    const result = await gplay.reviews({ appId, country, lang, num });
    return (result.data ?? []).map((item, index) =>
      mapScraperItem(item, country, lang, index),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[fetchPlayReviews]", { appId, country, lang, message });
    return [];
  }
}
