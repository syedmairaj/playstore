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

// ── Retry helper ──────────────────────────────────────────────────────────────

/**
 * Classifies whether an error is a transient network issue worth retrying.
 * ECONNRESET / ECONNREFUSED / ETIMEDOUT from google-play-scraper are common
 * when Google Play rate-limits or temporarily drops the scraper connection.
 */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const cause = (err as NodeJS.ErrnoException).code ?? "";
  return (
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    cause === "ECONNRESET" ||
    cause === "ECONNREFUSED" ||
    cause === "ETIMEDOUT"
  );
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the top-chart ranking for a given category + market from Google Play.
 * Returns an array ordered by chart rank (index 0 = #1).
 *
 * Uses `fullDetail: false` to keep latency low — we only need listing metadata,
 * not the full app detail page.
 *
 * Automatically retries up to MAX_RETRIES times on transient network errors
 * (ECONNRESET, ECONNREFUSED, ETIMEDOUT) — common when Google Play rate-limits
 * the scraper connection. Each retry waits RETRY_DELAY_MS before re-attempting.
 */
export async function fetchTopCharts({
  category,
  country,
  collection = "TOP_FREE",
  num = 30,
}: FetchTopChartsOptions): Promise<TopChartApp[]> {
  const mod = (gplay as unknown as { default?: typeof gplay }).default ?? gplay;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[fetchTopCharts] attempt ${attempt + 1}/${MAX_RETRIES + 1} after transient error — retrying in ${RETRY_DELAY_MS}ms`);
      }
      await delay(RETRY_DELAY_MS);
    }

    try {
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
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt >= MAX_RETRIES) {
        // Non-retryable error (e.g. bad category) or exhausted retries — throw immediately
        throw err;
      }
    }
  }

  // Should never reach here, but satisfies TS control-flow analysis
  throw lastErr;
}
