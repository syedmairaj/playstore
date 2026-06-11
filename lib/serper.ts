import "server-only";

import { SERPER_PLAY_REGION_DEFAULTS } from "@/constants/regions";
import { LIVE_RANKS_PREVIEW_UNAVAILABLE } from "@/lib/keywords/live-ranks-preview-tokens";
import { extractPackageIdFromPlayStoreDetailsUrl } from "@/lib/keywords/play-store-details-url";
import { supplementDeepRankSerperWithPlaySearch } from "@/lib/keywords/serper-deep-rank-supplement";
import { fetchPlayKeywordSearch } from "@/lib/play-store/fetch-play-keyword-search";
import { reindexSerpItemsByMergedOrder } from "@/lib/keywords/serper-snapshot-rank-resolve";
import {
  SERPER_MAX_COUNTRIES as _SERPER_MAX_COUNTRIES,
  SUPPORTED_COUNTRY_CODES as _SUPPORTED_COUNTRY_CODES,
  type SupportedCountryCode,
} from "@/lib/countries";

/**
 * Serper.dev — Google Search API client (server-only).
 *
 * Docs: https://serper.dev/playground (POST https://google.serper.dev/search with JSON body).
 *
 * We use Serper as a thin proxy over Google search so we can surface real Google
 * Play Store listings ranked **per country** for the Keyword Tracker / Competitor Spy
 * preview flows. The Play Store does not expose an official search API, but every
 * app detail page (`play.google.com/store/apps/details?id=…`) is indexed by Google,
 * so a properly-localized `gl` + `hl` query returns the same ordered results a
 * user in that locale would see. Keyword Tracker uses a small cascade of
 * Play-focused Google queries per country when the first SERP has no usable
 * Play Store app links; Competitor Spy uses the same mechanism with
 * `restrictToPlayStore` first.
 *
 * Security:
 * - The Serper API key is read from `process.env.SERPER_API_KEY` and **never**
 *   leaves the server. This module is marked `server-only`; any attempt to
 *   import it from a client component will fail the build.
 */

/** Serper Google Search endpoint (JSON in, JSON out). */
const SERPER_ENDPOINT = "https://google.serper.dev/search";

/** Per-country request timeout (Serper p95 ~1.2s). */
const SERPER_TIMEOUT_MS = 12_000;
const SERPER_DEEP_RANK_TIMEOUT_MS = 20_000;

/**
 * `site:play.google.com/store/apps …` often returns only a handful of indexed
 * detail pages for broad keywords (e.g. "run"). Keep trying fallback queries
 * until we reach this depth or exhaust the cascade.
 */
/** Minimum Play apps before stopping the query cascade (restrict mode). */
const PLAY_STORE_QUERY_MIN_ITEMS = 8;
const DEEP_RANK_QUERY_MIN_ITEMS = 15;
const DEEP_RANK_NUM_PER_PAGE = 50;
const DEEP_RANK_PAGES: readonly number[] = [1, 2];

/** Hard cap on countries per call — keeps fan-out + key usage predictable. */
export const SERPER_MAX_COUNTRIES = _SERPER_MAX_COUNTRIES;

/**
 * Allowed country codes for the user-facing selector. Adding a new country?
 * Wire it through:
 *   1. `SUPPORTED_COUNTRY_CODES` in `lib/countries.ts`
 *   2. `SERPER_PLAY_REGION_DEFAULTS` in `constants/regions.ts` (imported below)
 *   3. `messages/{en,ar}.json` → `countrySelector.countries.<code>`
 *
 * Defaults reflect typical store listings:
 *   us → English (Latin-script results)
 *   sa → Arabic (Saudi Arabia is RTL-first; Play returns Arabic metadata)
 *   ae → English (UAE Play Store skews EN for global SaaS; Arabic still ranks)
 *   in → English-primary SERP for India (`gl=in`); Hindi `hl` may be added later.
 *   cn → English UI for China-region Google results (`gl=cn`); see product disclaimers for worldwide vs mainland Play.
 *
 * If a workspace needs Arabic results for `ae`, callers can override `hl` per
 * country via `searchPlayStore(..., { localeOverrides: { ae: "ar" } })`.
 */
export const SUPPORTED_COUNTRY_CODES = _SUPPORTED_COUNTRY_CODES;

export type SerperCountryCode = SupportedCountryCode;

type GlHl = { gl: string; hl: string };

/** Default `gl` + `hl` per supported country (see `constants/regions.ts`). */
const COUNTRY_LOCALE_MAP: Record<SerperCountryCode, GlHl> = SERPER_PLAY_REGION_DEFAULTS;

export class SerperNotConfiguredError extends Error {
  readonly code = "serper_not_configured" as const;
  constructor(message = "SERPER_API_KEY is not configured") {
    super(message);
    this.name = "SerperNotConfiguredError";
  }
}

export class SerperApiError extends Error {
  readonly code = "serper_api_error" as const;
  constructor(message: string) {
    super(message);
    this.name = "SerperApiError";
  }
}

export type SerperPlayStoreItem = {
  /** Snippet/result title (e.g. "Calm – Meditation, Sleep, Relax"). */
  title: string;
  /** Canonical Play Store URL (`play.google.com/store/apps/details?id=…`). */
  link: string;
  /** Best-effort extracted package name (`id` query string), when present. */
  packageId: string | null;
  /** 1-indexed organic SERP position from Serper. */
  position: number;
  /** Optional Serper snippet — useful for previewing short descriptions. */
  snippet: string | null;
};

export type SerperPlayStoreCountryResult = {
  country: SerperCountryCode;
  gl: string;
  hl: string;
  items: SerperPlayStoreItem[];
  /**
   * Per-country failure. When set to `LIVE_RANKS_PREVIEW_UNAVAILABLE`, the UI maps it
   * to a friendly translated message (no raw HTTP text).
   */
  error: string | null;
};

export { LIVE_RANKS_PREVIEW_UNAVAILABLE } from "@/lib/keywords/live-ranks-preview-tokens";

export type SerperSearchOptions = {
  /** Optional `hl` override per country (e.g. force `ar` in UAE). */
  localeOverrides?: Partial<Record<SerperCountryCode, string>>;
  /**
   * When true, the first query is `site:play.google.com/store/apps …` (competitor-style),
   * with additional fallbacks when the SERP has no usable Play results.
   */
  restrictToPlayStore?: boolean;
  /** Override timeout (ms) — primarily for tests. */
  timeoutMs?: number;
  /**
   * Serper `num` (organic results depth). Default **20** for preview / Competitor Spy to
   * limit API payload and align with billing (**1 AI credit per country**, unchanged by depth).
   * Keyword **refresh** / live-rank use {@link deepRankSearch} (50 × 2 pages).
   */
  num?: number;
  /** Serper pagination pages to fetch and merge (1-indexed). */
  pages?: readonly number[];
  /** Prefer mobile-indexed Google results (Play Store search skew). */
  device?: "mobile" | "desktop";
  /**
   * Rank tracker preset: `restrictToPlayStore` + mobile + paginated `num: 50` on pages 1–2.
   * Billing stays per country, not per Serper HTTP call.
   */
  deepRankSearch?: boolean;
};

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number | string;
};

type SerperResponseBody = {
  organic?: SerperOrganic[];
};

/** Safe phrase for `site:` / quoted queries (strip quotes, collapse spaces). */
function normalizeKeywordForQuery(keyword: string): string {
  return String(keyword ?? "")
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Play-focused Google queries, tried in order until we get Play details URLs
 * in organic results (or exhaust the list).
 */
function playStoreSearchQueries(keyword: string, restrictToPlayStore: boolean): string[] {
  const k = normalizeKeywordForQuery(keyword);
  if (k.length === 0) return [];
  if (restrictToPlayStore) {
    return [
      `site:play.google.com/store/apps ${k}`,
      `site:play.google.com "${k}"`,
      `"${k}" app play store`,
      `${k} app`,
    ];
  }
  return [`"${k}" app play store`, `site:play.google.com "${k}"`, `${k} app`, k];
}

function isSupportedCountry(code: string): code is SerperCountryCode {
  return (SUPPORTED_COUNTRY_CODES as readonly string[]).includes(code);
}

/** Normalizes + validates user-supplied country codes. */
export function normalizeCountries(input: readonly string[]): SerperCountryCode[] {
  const seen = new Set<SerperCountryCode>();
  for (const raw of input) {
    const c = String(raw ?? "").trim().toLowerCase();
    if (!c) continue;
    if (!isSupportedCountry(c)) continue;
    seen.add(c);
    if (seen.size >= SERPER_MAX_COUNTRIES) break;
  }
  return [...seen];
}

const PLAY_STORE_APP_LINK_RE =
  /^https?:\/\/play\.google\.com\/store\/apps(?:\/details)?/i;

function isPlayStoreAppLink(link: string | undefined | null): boolean {
  if (!link) return false;
  if (!PLAY_STORE_APP_LINK_RE.test(link)) return false;
  return /[?&]id=[^&]+/i.test(link);
}

function resolveSerperNum(options: SerperSearchOptions): number {
  if (options.deepRankSearch) return DEEP_RANK_NUM_PER_PAGE;
  if (
    typeof options.num === "number" &&
    Number.isFinite(options.num) &&
    options.num >= 1 &&
    options.num <= 100
  ) {
    return Math.floor(options.num);
  }
  return 20;
}

function resolveSerperPages(options: SerperSearchOptions): number[] {
  if (options.pages?.length) {
    return [...new Set(options.pages.filter((p) => Number.isFinite(p) && p >= 1 && p <= 10))];
  }
  if (options.deepRankSearch) return [...DEEP_RANK_PAGES];
  return [1];
}

function resolveSerperDevice(options: SerperSearchOptions): "mobile" | undefined {
  if (options.device === "mobile" || options.deepRankSearch) return "mobile";
  return undefined;
}

function offsetItemsForSerperPage(
  items: SerperPlayStoreItem[],
  page: number,
  numPerPage: number,
): SerperPlayStoreItem[] {
  if (page <= 1) return items;
  const offset = (page - 1) * numPerPage;
  return items.map((item) => ({ ...item, position: item.position + offset }));
}

function mergePlayStoreItems(
  a: readonly SerperPlayStoreItem[],
  b: readonly SerperPlayStoreItem[],
): SerperPlayStoreItem[] {
  const byKey = new Map<string, SerperPlayStoreItem>();
  for (const item of [...a, ...b]) {
    const key = (item.packageId ?? item.link).trim().toLowerCase();
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || item.position < prev.position) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((x, y) => x.position - y.position);
}

function pickPlayStoreItems(organic: SerperOrganic[] | undefined): SerperPlayStoreItem[] {
  if (!Array.isArray(organic) || organic.length === 0) return [];
  const seenPkg = new Set<string>();
  const out: SerperPlayStoreItem[] = [];
  for (const row of organic) {
    const link = row?.link?.trim();
    if (!isPlayStoreAppLink(link)) continue;
    const pkg =
      extractPackageIdFromPlayStoreDetailsUrl(link!) ??
      (() => {
        const m = String(row.title ?? row.snippet ?? "").match(
          /\b((?:com|org|net|io|app)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b/i,
        );
        return m?.[1] ?? null;
      })();
    const dedupeKey = pkg ?? link!;
    if (seenPkg.has(dedupeKey)) continue;
    seenPkg.add(dedupeKey);
    const rawPos = row.position;
    let position: number;
    if (typeof rawPos === "number" && Number.isFinite(rawPos)) {
      position = rawPos;
    } else if (typeof rawPos === "string") {
      const parsed = Number.parseInt(rawPos.trim(), 10);
      position = Number.isFinite(parsed) ? parsed : out.length + 1;
    } else {
      position = out.length + 1;
    }
    out.push({
      title: row.title?.trim() || link!,
      link: link!,
      packageId: pkg,
      position,
      snippet: row.snippet?.trim() || null,
    });
  }
  return out;
}

async function finalizeDeepRankItems(
  bestItems: SerperPlayStoreItem[],
  keyword: string,
  country: SerperCountryCode,
  gl: string,
  hl: string,
  options: SerperSearchOptions,
): Promise<SerperPlayStoreItem[]> {
  let items = bestItems;
  let reindexed = false;
  if (options.deepRankSearch && items.length < DEEP_RANK_QUERY_MIN_ITEMS) {
    const serperCount = items.length;
    const playItems = await fetchPlayKeywordSearch(
      keyword,
      gl,
      hl,
      DEEP_RANK_NUM_PER_PAGE,
    );
    if (playItems.length > 0) {
      items = supplementDeepRankSerperWithPlaySearch(items, playItems);
      reindexed = true;
    }
    if (process.env.NODE_ENV !== "production") {
      console.debug("[serper:deep-rank-supplement]", {
        keyword,
        country,
        serperCount,
        playSearchCount: playItems.length,
        mergedCount: items.length,
      });
    }
  }
  if (!reindexed) {
    items = reindexSerpItemsByMergedOrder(items);
  }
  return items;
}

async function fetchOneCountry(
  apiKey: string,
  keyword: string,
  country: SerperCountryCode,
  options: SerperSearchOptions,
): Promise<SerperPlayStoreCountryResult> {
  const defaults = COUNTRY_LOCALE_MAP[country];
  const hl = options.localeOverrides?.[country]?.trim() || defaults.hl;
  const restrict = Boolean(options.restrictToPlayStore || options.deepRankSearch);
  const queries = playStoreSearchQueries(keyword, restrict);
  const timeoutMs =
    options.timeoutMs ??
    (options.deepRankSearch ? SERPER_DEEP_RANK_TIMEOUT_MS : SERPER_TIMEOUT_MS);
  const num = resolveSerperNum(options);
  const pages = resolveSerperPages(options);
  const device = resolveSerperDevice(options);

  let bestItems: SerperPlayStoreItem[] = [];
  const minTarget = options.deepRankSearch
    ? DEEP_RANK_QUERY_MIN_ITEMS
    : PLAY_STORE_QUERY_MIN_ITEMS;
  const minItemsForExit = restrict ? Math.min(minTarget, num * pages.length) : 1;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    let queryHadPlaySignal = false;

    for (const page of pages) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          q,
          gl: defaults.gl,
          hl,
          num,
          page,
        };
        if (device) body.device = device;

        const res = await fetch(SERPER_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": apiKey,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
          cache: "no-store",
        });

        const raw = await res.text();
        let json: SerperResponseBody;
        try {
          json = (raw ? JSON.parse(raw) : {}) as SerperResponseBody;
        } catch {
          continue;
        }

        if (!res.ok) continue;

        const pageItems = offsetItemsForSerperPage(
          pickPlayStoreItems(json.organic),
          page,
          num,
        );
        if (pageItems.length > 0) queryHadPlaySignal = true;
        bestItems = mergePlayStoreItems(bestItems, pageItems);
      } catch {
        /* try next page / query */
      } finally {
        clearTimeout(timer);
      }
    }

    const deepEnough = bestItems.length >= minItemsForExit;
    const shouldReturn =
      i === queries.length - 1 || (restrict ? deepEnough : queryHadPlaySignal);

    if (shouldReturn) {
      const items = await finalizeDeepRankItems(
        bestItems,
        keyword,
        country,
        defaults.gl,
        hl,
        options,
      );
      return {
        country,
        gl: defaults.gl,
        hl,
        items,
        error: items.length > 0 ? null : LIVE_RANKS_PREVIEW_UNAVAILABLE,
      };
    }
  }

  const items = await finalizeDeepRankItems(
    bestItems,
    keyword,
    country,
    defaults.gl,
    hl,
    options,
  );
  return {
    country,
    gl: defaults.gl,
    hl,
    items,
    error: items.length > 0 ? null : LIVE_RANKS_PREVIEW_UNAVAILABLE,
  };
}

/**
 * Search Google (via Serper) for Play Store apps matching `keyword`, in parallel
 * across the provided `countries`. Always returns one entry per requested country
 * so partial failures still render meaningful UI; check `error` per result.
 *
 * Throws only when `SERPER_API_KEY` is missing — every other failure is per-country.
 */
export async function searchPlayStore(
  keyword: string,
  countries: readonly string[] = ["us"],
  options: SerperSearchOptions = {},
): Promise<SerperPlayStoreCountryResult[]> {
  const trimmed = String(keyword ?? "").trim();
  if (trimmed.length === 0) return [];

  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    throw new SerperNotConfiguredError();
  }

  const normalized = normalizeCountries(countries);
  if (normalized.length === 0) {
    throw new SerperApiError(
      `No supported countries supplied (${(SUPPORTED_COUNTRY_CODES as readonly string[]).join("|")}).`,
    );
  }

  const results = await Promise.all(
    normalized.map((c) => fetchOneCountry(apiKey, trimmed, c, options)),
  );
  return results;
}

/**
 * True when the server has a Serper key configured. UI uses this (via API)
 * to choose between live preview and mock fallback.
 */
export function isSerperConfigured(): boolean {
  const k = process.env.SERPER_API_KEY?.trim();
  return Boolean(k && k.length > 0);
}


