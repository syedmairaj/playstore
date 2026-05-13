import "server-only";

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
 * user in that locale would see.
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

/** Hard cap on countries per call — keeps fan-out + key usage predictable. */
export const SERPER_MAX_COUNTRIES = _SERPER_MAX_COUNTRIES;

/**
 * Allowed country codes for the user-facing selector. Adding a new country?
 * Wire it through:
 *   1. `SUPPORTED_COUNTRY_CODES` in `lib/countries.ts`
 *   2. `COUNTRY_LOCALE_MAP` below (gl / hl defaults)
 *   3. `messages/{en,ar}.json` → `countrySelector.countries.<code>`
 *
 * Defaults reflect typical store listings:
 *   us → English (Latin-script results)
 *   sa → Arabic (Saudi Arabia is RTL-first; Play returns Arabic metadata)
 *   ae → English (UAE Play Store skews EN for global SaaS; Arabic still ranks)
 *
 * If a workspace needs Arabic results for `ae`, callers can override `hl` per
 * country via `searchPlayStore(..., { localeOverrides: { ae: "ar" } })`.
 */
export const SUPPORTED_COUNTRY_CODES = _SUPPORTED_COUNTRY_CODES;

export type SerperCountryCode = SupportedCountryCode;

type GlHl = { gl: string; hl: string };

/** Default `gl` + `hl` per supported country. See note above. */
const COUNTRY_LOCALE_MAP: Record<SerperCountryCode, GlHl> = {
  us: { gl: "us", hl: "en" },
  sa: { gl: "sa", hl: "ar" },
  ae: { gl: "ae", hl: "en" },
};

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
  /** Per-country errors are surfaced here so partial results can still render. */
  error: string | null;
};

export type SerperSearchOptions = {
  /** Optional `hl` override per country (e.g. force `ar` in UAE). */
  localeOverrides?: Partial<Record<SerperCountryCode, string>>;
  /**
   * When true, the query is wrapped as `site:play.google.com/store/apps "<q>"`.
   * Used by the Competitor Spy preview (search for a competitor's package name
   * or brand restricted to Play Store).
   */
  restrictToPlayStore?: boolean;
  /** Override timeout (ms) — primarily for tests. */
  timeoutMs?: number;
};

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

type SerperResponseBody = {
  organic?: SerperOrganic[];
};

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

const PLAY_DETAILS_LINK_RE = /^https?:\/\/play\.google\.com\/store\/apps\/details/i;

/** Extracts the `id` query (Android package name) from a Play details URL. */
function packageIdFromLink(link: string): string | null {
  try {
    const url = new URL(link);
    if (!/(^|\.)play\.google\.com$/i.test(url.hostname)) return null;
    if (!/\/store\/apps\/details/i.test(url.pathname)) return null;
    const id = url.searchParams.get("id");
    return id && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

function isPlayStoreAppLink(link: string | undefined | null): boolean {
  if (!link) return false;
  return PLAY_DETAILS_LINK_RE.test(link);
}

function pickPlayStoreItems(organic: SerperOrganic[] | undefined): SerperPlayStoreItem[] {
  if (!Array.isArray(organic) || organic.length === 0) return [];
  const seenPkg = new Set<string>();
  const out: SerperPlayStoreItem[] = [];
  for (const row of organic) {
    const link = row?.link?.trim();
    if (!isPlayStoreAppLink(link)) continue;
    const pkg = packageIdFromLink(link!);
    const dedupeKey = pkg ?? link!;
    if (seenPkg.has(dedupeKey)) continue;
    seenPkg.add(dedupeKey);
    out.push({
      title: row.title?.trim() || link!,
      link: link!,
      packageId: pkg,
      position: typeof row.position === "number" ? row.position : out.length + 1,
      snippet: row.snippet?.trim() || null,
    });
  }
  return out;
}

async function fetchOneCountry(
  apiKey: string,
  keyword: string,
  country: SerperCountryCode,
  options: SerperSearchOptions,
): Promise<SerperPlayStoreCountryResult> {
  const defaults = COUNTRY_LOCALE_MAP[country];
  const hl = options.localeOverrides?.[country]?.trim() || defaults.hl;
  const q = options.restrictToPlayStore
    ? `site:play.google.com/store/apps ${keyword}`
    : keyword;

  const ctrl = new AbortController();
  const timeoutMs = options.timeoutMs ?? SERPER_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q, gl: defaults.gl, hl, num: 20 }),
      signal: ctrl.signal,
      cache: "no-store",
    });

    const raw = await res.text();
    let json: SerperResponseBody;
    try {
      json = (raw ? JSON.parse(raw) : {}) as SerperResponseBody;
    } catch {
      return {
        country,
        gl: defaults.gl,
        hl,
        items: [],
        error: `Serper returned non-JSON (HTTP ${res.status})`,
      };
    }
    if (!res.ok) {
      return {
        country,
        gl: defaults.gl,
        hl,
        items: [],
        error: `Serper HTTP ${res.status}`,
      };
    }
    return {
      country,
      gl: defaults.gl,
      hl,
      items: pickPlayStoreItems(json.organic),
      error: null,
    };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "timeout"
          : e.message
        : "fetch_failed";
    return {
      country,
      gl: defaults.gl,
      hl,
      items: [],
      error: msg,
    };
  } finally {
    clearTimeout(timer);
  }
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
    throw new SerperApiError("No supported countries supplied (us|sa|ae).");
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


