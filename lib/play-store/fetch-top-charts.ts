import "server-only";
import gplay from "google-play-scraper";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TopChartApp = {
  /** Play Store package name */
  appId: string;
  title: string;
  developer: string;
  /** Icon image URL */
  icon: string;
  /** 1–5 star rating, or null if no ratings yet */
  score: number | null;
  /** Raw ratings count */
  ratings: number | null;
  /** Install range string e.g. "10,000,000+" */
  installs: string | null;
  /** Short description (first sentence the Play Store shows in search results) */
  summary: string | null;
  /** Genre label e.g. "Health & Fitness" */
  genre: string | null;
};

export type TopChartCollection = "TOP_FREE" | "TOP_PAID" | "GROSSING";

export type FetchTopChartsOptions = {
  /** gplay category string e.g. "HEALTH_AND_FITNESS" */
  category: string;
  /** ISO 3166-1 alpha-2 country code */
  country: string;
  collection?: TopChartCollection;
  num?: number;
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the top-chart ranking for a given category + market from Google Play.
 * Returns an array ordered by chart rank (index 0 = #1).
 *
 * Uses `fullDetail: false` to keep latency low — we only need listing metadata,
 * not the full app detail page.
 */
export async function fetchTopCharts({
  category,
  country,
  collection = "TOP_FREE",
  num = 30,
}: FetchTopChartsOptions): Promise<TopChartApp[]> {
  const mod = (gplay as unknown as { default?: typeof gplay }).default ?? gplay;

  const raw = await (mod as unknown as {
    list: (opts: {
      category: string;
      collection: string;
      country: string;
      num: number;
      fullDetail: boolean;
    }) => Promise<Array<Record<string, unknown>>>;
  }).list({
    category,
    collection,
    country,
    num,
    fullDetail: false,
  });

  return raw.map((a) => ({
    appId: String(a.appId ?? ""),
    title: String(a.title ?? ""),
    developer: String(a.developer ?? ""),
    icon: String(a.icon ?? ""),
    score: typeof a.score === "number" ? a.score : null,
    ratings: typeof a.ratings === "number" ? a.ratings : null,
    installs: typeof a.installs === "string" ? a.installs : null,
    summary: typeof a.summary === "string" && a.summary ? a.summary : null,
    genre: typeof a.genre === "string" && a.genre ? a.genre : null,
  }));
}
