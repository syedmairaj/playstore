/** Session bridge: Competitor Spy / Quick Wins → AI Listing Optimizer keywords field. */
export const LISTING_OPTIMIZER_KEYWORDS_PREFILL_STORAGE =
  "playstore:listingOptimizer:keywordsPrefill";

/**
 * Primary injection queue (sessionStorage): JSON string[].
 * @deprecated Prefer {@link PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE} — still read on optimizer mount.
 */
export const SEO_OPTIMIZER_INJECTED_KEYWORDS_STORAGE = "seo_optimizer_injected_keywords";

/**
 * Competitor Spy → Listing Optimizer bridge (localStorage): comma/newline-separated keyword string.
 * Read once on optimizer mount, merged into Target Keywords chips, then removed.
 */
export const PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE = "playstore_injected_keyword_context";

/** Same-tab signal: Listing Optimizer should re-consume injection queues. */
export const OPTIMIZER_KEYWORDS_INJECTED_EVENT = "playstore:optimizer-keywords-injected";

/**
 * Competitor Spy → Listing Optimizer bridge (localStorage): JSON string[].
 * Carries competitor pain-point phrases that should be inverted into positive
 * positioning angles — never passed as raw keywords.
 * Read once on optimizer mount as a `userInstruction` addendum, then removed.
 */
export const PLAYSTORE_INJECTED_COMPETITOR_VULNERABILITIES_STORAGE =
  "playstore_injected_competitor_vulnerabilities";

/** Restores wizard inputs on remount when no fresh keyword injection is queued. */
export const LISTING_OPTIMIZER_SESSION_STORAGE = "playstore:optimizer:session";

export type ListingOptimizerSessionSnapshot = {
  appId: string;
  keywords: string;
  appName: string;
  category: string;
  features: string;
  toneStyle: string;
  previewShortDesc: string;
  previewIconUrl: string;
};

export function readListingOptimizerSession(): ListingOptimizerSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LISTING_OPTIMIZER_SESSION_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ListingOptimizerSessionSnapshot>;
    const appId = String(parsed.appId ?? "").trim();
    if (!appId) return null;
    return {
      appId,
      keywords: String(parsed.keywords ?? ""),
      appName: String(parsed.appName ?? ""),
      category: String(parsed.category ?? ""),
      features: String(parsed.features ?? ""),
      toneStyle: String(parsed.toneStyle ?? "professional"),
      previewShortDesc: String(parsed.previewShortDesc ?? ""),
      previewIconUrl: String(parsed.previewIconUrl ?? ""),
    };
  } catch {
    return null;
  }
}

export function writeListingOptimizerSession(snapshot: ListingOptimizerSessionSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      LISTING_OPTIMIZER_SESSION_STORAGE,
      JSON.stringify(snapshot),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearListingOptimizerSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LISTING_OPTIMIZER_SESSION_STORAGE);
  } catch {
    /* */
  }
}

export const LISTING_OPTIMIZER_KEYWORDS_URL_MAX = 400;

const APP_LOCALES = new Set(["en", "ar"]);

export type ListingOptimizerNavigationHref =
  | `/app/${string}/listing-optimizer`
  | {
      pathname: `/app/${string}/listing-optimizer`;
      query?: { keywords?: string; appId?: string };
    };

/** Locale-free app path for next-intl `router.push` / `Link` (do not prefix `/${locale}`). */
export function listingOptimizerPathname(workspaceId: string): `/app/${string}/listing-optimizer` | null {
  const wid = workspaceId.trim();
  if (!wid || wid.includes("/") || APP_LOCALES.has(wid)) return null;
  return `/app/${wid}/listing-optimizer`;
}

/** Strip accidental `/en` or `/ar` prefix so next-intl does not produce `/en/en/...`. */
export function normalizeListingOptimizerPathname(pathname: string): string {
  const trimmed = pathname.trim();
  const match = trimmed.match(/^\/(en|ar)(\/app\/[\w-]+\/listing-optimizer)\/?$/);
  if (match) return match[2];
  return trimmed.replace(/\?.*$/, "").replace(/\/$/, "") || trimmed;
}

function readInjectedOptimizerKeywordsRaw(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SEO_OPTIMIZER_INJECTED_KEYWORDS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim());
  } catch {
    return [];
  }
}

function readPlaystoreKeywordContextRaw(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE)?.trim();
    if (!raw) return [];
    return raw
      .split(/[,;\n]+/u)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writePlaystoreKeywordContext(terms: string[]): void {
  if (typeof window === "undefined") return;
  const merged = mergeOptimizerKeywordText("", terms);
  if (!merged) return;
  try {
    localStorage.setItem(PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE, merged);
  } catch {
    /* quota / private mode */
  }
}

/** Append unique keyword strings to session + localStorage injection queues. */
export function appendInjectedOptimizerKeywords(keywords: string[]): void {
  if (typeof window === "undefined") return;
  const incoming = keywords.map((k) => k.trim()).filter(Boolean);
  if (!incoming.length) return;
  try {
    const merged = [...readInjectedOptimizerKeywordsRaw()];
    const seen = new Set(merged.map((t) => t.toLowerCase()));
    for (const term of incoming) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(term);
    }
    sessionStorage.setItem(
      SEO_OPTIMIZER_INJECTED_KEYWORDS_STORAGE,
      JSON.stringify(merged),
    );
    const contextMerged = [
      ...readPlaystoreKeywordContextRaw(),
      ...incoming,
    ];
    writePlaystoreKeywordContext(contextMerged);
  } catch {
    /* quota / private mode */
  }
}

/** Read and clear legacy sessionStorage injection queue. */
export function consumeInjectedOptimizerKeywords(): string[] {
  if (typeof window === "undefined") return [];
  const terms = readInjectedOptimizerKeywordsRaw();
  try {
    sessionStorage.removeItem(SEO_OPTIMIZER_INJECTED_KEYWORDS_STORAGE);
  } catch {
    /* */
  }
  return terms;
}

/** Whether a fresh Competitor Spy → Optimizer keyword context is queued (not consumed). */
export function hasPlaystoreInjectedKeywordContext(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE)?.trim());
  } catch {
    return false;
  }
}

/** Read and clear localStorage keyword context string. */
export function consumePlaystoreKeywordContext(): string[] {
  if (typeof window === "undefined") return [];
  const terms = readPlaystoreKeywordContextRaw();
  try {
    localStorage.removeItem(PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE);
  } catch {
    /* */
  }
  return terms;
}

/** Clear stale injection queues before writing a fresh optimizer keyword context. */
export function clearOptimizerKeywordInjectionQueues(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SEO_OPTIMIZER_INJECTED_KEYWORDS_STORAGE);
    sessionStorage.removeItem(LISTING_OPTIMIZER_KEYWORDS_PREFILL_STORAGE);
    localStorage.removeItem(PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE);
    localStorage.removeItem(PLAYSTORE_INJECTED_COMPETITOR_VULNERABILITIES_STORAGE);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Competitor Spy → Listing Optimizer: replace Target Keywords on next mount.
 * Clears legacy session queues so hydration does not double-merge.
 */
export function setPlaystoreInjectedKeywordContext(text: string): void {
  if (typeof window === "undefined") return;
  const trimmed = text.trim();
  clearOptimizerKeywordInjectionQueues();
  if (!trimmed) return;
  try {
    localStorage.setItem(PLAYSTORE_INJECTED_KEYWORD_CONTEXT_STORAGE, trimmed);
    window.dispatchEvent(new CustomEvent(OPTIMIZER_KEYWORDS_INJECTED_EVENT));
  } catch {
    /* quota / private mode */
  }
}

/** Merge all injection sources (localStorage context, session queue) once on optimizer mount. */
export function consumeAllOptimizerKeywordInjections(): string[] {
  const fromContext = consumePlaystoreKeywordContext();
  const fromSession = consumeInjectedOptimizerKeywords();
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const term of [...fromContext, ...fromSession]) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(term);
  }
  return parts;
}

/** Merge comma/newline-separated keyword text with additional unique terms (max 2000 chars). */
export function mergeOptimizerKeywordText(existing: string, additions: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const sources = [existing, ...additions];
  for (const chunk of sources) {
    for (const term of chunk.split(/[,;\n]+/u)) {
      const t = term.trim();
      if (t.length < 1) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(t);
    }
  }
  return parts.join(", ").slice(0, 2000);
}

export function stashListingOptimizerKeywordsPrefill(text: string): void {
  const v = text.trim();
  if (!v || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LISTING_OPTIMIZER_KEYWORDS_PREFILL_STORAGE, v);
    writePlaystoreKeywordContext(v.split(/[,;\n]+/u).map((s) => s.trim()).filter(Boolean));
  } catch {
    /* quota / private mode */
  }
}

export function buildListingOptimizerNavigationHref(
  workspaceId: string,
  keywordsText?: string,
): ListingOptimizerNavigationHref | null {
  const pathname = listingOptimizerPathname(workspaceId);
  if (!pathname) return null;

  const text = keywordsText?.trim() ?? "";
  if (!text) return pathname;

  stashListingOptimizerKeywordsPrefill(text);
  if (text.length <= LISTING_OPTIMIZER_KEYWORDS_URL_MAX) {
    return { pathname, query: { keywords: text } };
  }
  return pathname;
}

/** Persist competitor pain-point phrases for inversion-angle generation. */
export function setPlaystoreInjectedCompetitorVulnerabilities(terms: string[]): void {
  if (typeof window === "undefined") return;
  const clean = terms.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) {
    try { localStorage.removeItem(PLAYSTORE_INJECTED_COMPETITOR_VULNERABILITIES_STORAGE); } catch { /* */ }
    return;
  }
  try {
    localStorage.setItem(
      PLAYSTORE_INJECTED_COMPETITOR_VULNERABILITIES_STORAGE,
      JSON.stringify(clean),
    );
  } catch { /* quota / private mode */ }
}

/** Read and clear the competitor vulnerabilities injection. Returns empty array if nothing stored. */
export function consumePlaystoreCompetitorVulnerabilities(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLAYSTORE_INJECTED_COMPETITOR_VULNERABILITIES_STORAGE);
    localStorage.removeItem(PLAYSTORE_INJECTED_COMPETITOR_VULNERABILITIES_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

type IntlRouterPush = {
  push: (href: ListingOptimizerNavigationHref | string) => void;
};

export function navigateToListingOptimizer(
  router: IntlRouterPush,
  workspaceId: string,
  keywordsText = "",
  appId?: string,
  competitorVulnerabilities?: string[],
): boolean {
  const trimmed = keywordsText.trim();
  if (trimmed) {
    setPlaystoreInjectedKeywordContext(trimmed);
  }
  if (competitorVulnerabilities?.length) {
    setPlaystoreInjectedCompetitorVulnerabilities(competitorVulnerabilities);
  }
  const pathname = listingOptimizerPathname(workspaceId);
  if (!pathname) return false;
  const aid = appId?.trim();
  const href: ListingOptimizerNavigationHref =
    aid && aid.length > 0
      ? { pathname, query: { appId: aid } }
      : pathname;
  try {
    router.push(href);
    return true;
  } catch {
    return false;
  }
}
