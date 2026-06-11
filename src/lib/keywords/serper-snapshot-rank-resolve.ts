import {
  normalizeCompetitorDisplayName,
  resolveCompetitorInitials,
} from "@/lib/competitors/competitor-initials";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { extractPackageIdFromPlayStoreDetailsUrl } from "@/lib/keywords/play-store-details-url";

/** @deprecated import `normalizeCompetitorDisplayName` from `@/lib/competitors/competitor-initials` */
export { normalizeCompetitorDisplayName as normalizeCompetitorDisplayNameForRank } from "@/lib/competitors/competitor-initials";

/** Subset of the Serper preview JSON used to compute a stored rank. */
export type SerperCountryResultForSnapshot = {
  country: string;
  error: string | null;
  items: readonly SerperRankItem[];
};

export type SerperRankItem = {
  packageId: string | null;
  position: number | string;
  link?: string;
  title?: string;
};

export type SerperRankResolveOptions = {
  /** Play Store listing title hint — used when package match fails (title / best-effort). */
  displayName?: string | null;
  /** Manual production Play Store package id override. */
  canonicalPackageId?: string | null;
  /** Previously learned package id from a successful Serper title match. */
  serpMatchedPackageId?: string | null;
  /** When true (default), run a lower-threshold title scan if package + strict title fail. */
  bestEffortTitleMatch?: boolean;
  warnIfMissingCanonical?: boolean;
  logLabel?: string;
  logPrefix?: string;
};

export type SerpLookupSource = "canonical" | "serp_matched" | "internal";

export type SerpPackageLookup = {
  internalPackageId: string;
  serpLookupPackageId: string;
  lookupSource: SerpLookupSource;
  /** @deprecated use lookupSource === "canonical" */
  usedCanonical: boolean;
};

/** Resolve which package id to match against live Serper results. */
export function serpLookupForPackage(
  internalPackageId: string,
  canonicalPackageId?: string | null,
  serpMatchedPackageId?: string | null,
): SerpPackageLookup {
  const internal =
    normPkgForSerperSnapshot(internalPackageId) ??
    String(internalPackageId ?? "").trim().toLowerCase();
  const canonical = normPkgForSerperSnapshot(canonicalPackageId);
  if (canonical) {
    return {
      internalPackageId: internal,
      serpLookupPackageId: canonical,
      lookupSource: "canonical",
      usedCanonical: true,
    };
  }
  const serpMatched = normPkgForSerperSnapshot(serpMatchedPackageId);
  if (serpMatched) {
    return {
      internalPackageId: internal,
      serpLookupPackageId: serpMatched,
      lookupSource: "serp_matched",
      usedCanonical: false,
    };
  }
  return {
    internalPackageId: internal,
    serpLookupPackageId: internal,
    lookupSource: "internal",
    usedCanonical: false,
  };
}

/** Heuristic for internal/test ids that will not appear in a live Play Store SERP. */
export function isLikelyNonProductionPackageId(pkg: string): boolean {
  const n = normPkgForSerperSnapshot(pkg);
  if (!n) return false;
  return (
    n.startsWith("com.example.") ||
    n.includes(".test.") ||
    n.includes(".demo.") ||
    n.includes(".stub.") ||
    n.endsWith(".debug")
  );
}

export function warnWhenMissingCanonicalPackageId(
  logPrefix: string,
  context: { label: string; internalPackageId: string; displayName?: string | null },
): void {
  const likelyTest = isLikelyNonProductionPackageId(context.internalPackageId);
  console.warn(
    `[${logPrefix}] no canonical or serp_matched package id — SERP lookup falls back to internal package_name${likelyTest ? " (unlikely to appear in live Play Store)" : ""}. Title best-effort matching will run when displayName is set.`,
    {
      label: context.label,
      internalPackageId: context.internalPackageId,
      displayName: context.displayName ?? null,
      likelyTestPackage: likelyTest,
    },
  );
}

/** Structured per-target log for serper-refresh / live-rank validation. */
export function logSerpTargetMatchResult(
  logPrefix: string,
  context: {
    keyword?: string;
    country: string;
    label: string;
    internalPackageId: string;
    serpLookupPackageId: string;
    usedCanonical: boolean;
    displayName?: string | null;
  },
  result: SerperRankMatchResult,
): void {
  const status = result.rank != null ? "Match Found" : "No Match";
  console.log(`[${logPrefix}] ${status}`, {
    ...context,
    matchKind: result.matchKind,
    matchScore: result.matchScore,
    rank: result.rank,
  });
}

/** Ranks above this are treated as "not ranked" in live-rank API responses. */
export const LIVE_RANK_VISIBILITY_CEILING = 50;

export type LiveRankNotRankedReason = "not_in_serp" | "outside_visibility_window" | "serper_error";

export type SerperRankMatchKind = "package" | "title" | "none";

/** Minimum combined title similarity to accept a non-package match. */
export const TITLE_SIMILARITY_THRESHOLD = 0.7;
/** Lower floor for best-effort title scan when package id is absent from SERP. */
export const BEST_EFFORT_TITLE_SIMILARITY_THRESHOLD = 0.55;

export type SerperRankMatchResult = {
  rank: number | null;
  matchKind: SerperRankMatchKind;
  matchScore: number | null;
  /** Package id from the winning SERP row — persisted as serp_matched_package_id on title match. */
  matchedPackageId?: string | null;
  /** Play listing title from the winning SERP row (for UI initials fallback). */
  matchedSerpTitle?: string | null;
};

export function isRankMatchEstablished(
  match: Pick<SerperRankMatchResult, "matchKind" | "rank"> | null | undefined,
): boolean {
  return (
    match != null &&
    match.matchKind !== "none" &&
    match.rank != null &&
    match.rank >= 1
  );
}

const GENERIC_PACKAGE_SEGMENTS = new Set([
  "com",
  "org",
  "net",
  "io",
  "app",
  "android",
  "ios",
  "mobile",
  "phone",
  "free",
  "pro",
  "lite",
]);

/** Monogram for competitor avatar — DB name, then Serper title, then package segment. */
export function competitorInitialForDisplay(
  displayName: string | null | undefined,
  packageId: string,
  serpDisplayName?: string | null,
): string {
  return resolveCompetitorInitials(displayName, packageId, serpDisplayName) ?? "";
}

export function normPkgForSerperSnapshot(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  let t = id.trim();
  if (!t) return null;
  try {
    t = decodeURIComponent(t).trim();
  } catch {
    /* keep raw trimmed value */
  }
  const low = t.toLowerCase();
  return low.length > 0 ? low : null;
}

function normMarket(m: string): string {
  return String(m ?? "").trim().toLowerCase();
}

function itemPosition(item: { position: number | string }): number | null {
  const p = item.position;
  if (typeof p === "number" && Number.isFinite(p)) return Math.round(p);
  if (typeof p === "string") {
    const n = Number.parseInt(p.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const PACKAGE_ID_IN_TEXT_RE =
  /\b((?:com|org|net|io|app)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b/i;

/** Package id from Serper row `packageId`, Play URL, or title/snippet fallback. */
export function effectiveSerperPreviewItemPackage(item: {
  packageId: string | null;
  link?: string;
  title?: string | null;
  snippet?: string | null;
}): string | null {
  const fromId = normPkgForSerperSnapshot(item.packageId);
  if (fromId) return fromId;
  const fromLink = normPkgForSerperSnapshot(
    extractPackageIdFromPlayStoreDetailsUrl(item.link),
  );
  if (fromLink) return fromLink;
  for (const blob of [item.title, item.snippet]) {
    if (!blob || typeof blob !== "string") continue;
    const m = blob.match(PACKAGE_ID_IN_TEXT_RE);
    if (m?.[1]) {
      const parsed = normPkgForSerperSnapshot(m[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

/** Core id segment(s) for fuzzy family matching — e.g. com.strava.android → strava. */
export function packageCoreSegments(pkg: string): string[] {
  const parts = pkg.split(".").filter((p) => p.length > 0);
  if (parts.length === 0) return [];
  const meaningful = parts.filter((p) => !GENERIC_PACKAGE_SEGMENTS.has(p));
  const out = new Set<string>([pkg]);
  if (meaningful.length > 0) {
    out.add(meaningful.join("."));
    const last = meaningful[meaningful.length - 1]!;
    if (last.length >= 5) out.add(last);
  }
  return [...out];
}

/**
 * Package match: exact, suffix/prefix family, or shared core segment (min 5 chars).
 */
export function itemMatchesTrackedPackage(
  want: string,
  item: { packageId: string | null; link?: string; title?: string | null; snippet?: string | null },
): boolean {
  const ep = effectiveSerperPreviewItemPackage(item);
  if (!ep) return false;
  if (ep === want) return true;
  if (ep.startsWith(`${want}.`) || want.startsWith(`${ep}.`)) return true;

  const wantSegs = packageCoreSegments(want);
  const epSegs = packageCoreSegments(ep);
  for (const ws of wantSegs) {
    if (ws.length < 5) continue;
    for (const es of epSegs) {
      if (ws === es) return true;
      if (es.startsWith(`${ws}.`) || ws.startsWith(`${es}.`)) return true;
    }
  }
  return false;
}

function normalizeTitleForMatch(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(row[j]! + 1, prev + 1, row[j - 1]! + cost);
      row[j - 1] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length]!;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function wordOverlapRatio(shorter: string, longer: string): number {
  const shortTokens = shorter.split(" ").filter((t) => t.length >= 3);
  if (shortTokens.length === 0) return 0;
  const longSet = new Set(longer.split(" ").filter((t) => t.length >= 3));
  const hit = shortTokens.filter((t) => longSet.has(t)).length;
  return hit / shortTokens.length;
}

/**
 * Combined title + package-segment similarity (0–1).
 * Used when exact package id matching fails.
 */
export function scoreTitleMatchAgainstTarget(
  title: string | null | undefined,
  displayName: string | null | undefined,
  packageName?: string | null,
): number {
  const titleNorm = normalizeTitleForMatch(title ?? "");
  if (!titleNorm) return 0;

  let best = 0;
  const cleanedName =
    normalizeCompetitorDisplayName(displayName) ?? String(displayName ?? "").trim();
  const nameNorm = normalizeTitleForMatch(cleanedName);

  if (nameNorm.length >= 3) {
    const titleLead = (titleNorm.split(/[:\-|–—]/)[0] ?? titleNorm).trim();
    const nameLead = (nameNorm.split(/[:\-|–—]/)[0] ?? nameNorm).trim();

    best = Math.max(best, levenshteinSimilarity(titleLead, nameLead));
    best = Math.max(best, levenshteinSimilarity(titleNorm, nameNorm));
    best = Math.max(best, wordOverlapRatio(nameNorm, titleNorm));
    best = Math.max(best, wordOverlapRatio(titleNorm, nameNorm));

    if (
      (titleLead.includes(nameLead) || nameLead.includes(titleLead)) &&
      Math.min(nameLead.length, titleLead.length) >= 4
    ) {
      const shorter = Math.min(nameLead.length, titleLead.length);
      const longer = Math.max(nameLead.length, titleLead.length);
      best = Math.max(best, 0.75 + 0.2 * (shorter / longer));
    }
  }

  const want = normPkgForSerperSnapshot(packageName);
  if (want) {
    for (const seg of packageCoreSegments(want)) {
      if (seg.length < 4) continue;
      if (titleNorm.includes(seg)) {
        best = Math.max(best, 0.88);
      }
      const titleLead = (titleNorm.split(/[:\-|–—]/)[0] ?? "").trim();
      if (titleLead === seg || titleLead.startsWith(`${seg} `)) {
        best = Math.max(best, 0.92);
      }
    }
  }

  return Math.min(1, best);
}

/**
 * High-threshold title match — legacy boolean helper; uses similarity threshold.
 */
export function itemTitleMatchesDisplayName(
  title: string | null | undefined,
  displayName: string | null | undefined,
  packageName?: string | null,
): boolean {
  return (
    scoreTitleMatchAgainstTarget(title, displayName, packageName) >=
    TITLE_SIMILARITY_THRESHOLD
  );
}

export function formatSerperTopResultsForLog(
  items: readonly SerperRankItem[],
  limit = 5,
): Array<{ position: number | null; title: string; packageId: string | null }> {
  return items.slice(0, limit).map((item) => ({
    position: itemPosition(item),
    title: String(item.title ?? "").trim().slice(0, 120) || "(no title)",
    packageId: effectiveSerperPreviewItemPackage(item),
  }));
}

export type SerperTopResultWithScore = {
  position: number | null;
  title: string;
  packageId: string | null;
  matchScore: number;
};

/** Top-N SERP rows with per-target similarity scores (debug). */
export function formatSerperTopResultsWithMatchScores(
  items: readonly SerperRankItem[],
  target: { packageName: string; displayName?: string | null },
  limit = 5,
): SerperTopResultWithScore[] {
  const displayName =
    normalizeCompetitorDisplayName(target.displayName) ?? target.displayName ?? null;
  return items.slice(0, limit).map((item) => ({
    position: itemPosition(item),
    title: String(item.title ?? "").trim().slice(0, 120) || "(no title)",
    packageId: effectiveSerperPreviewItemPackage(item),
    matchScore: Number(
      scoreTitleMatchAgainstTarget(item.title, displayName, target.packageName).toFixed(3),
    ),
  }));
}

function matchFromSerpItem(
  item: SerperRankItem,
  pos: number,
  matchKind: "package" | "title",
  matchScore: number,
): SerperRankMatchResult {
  return {
    rank: pos,
    matchKind,
    matchScore: Number(matchScore.toFixed(3)),
    matchedPackageId: effectiveSerperPreviewItemPackage(item),
    matchedSerpTitle: String(item.title ?? "").trim() || null,
  };
}

export function findBestRankInSerpItems(
  items: readonly SerperRankItem[],
  packageName: string,
  options?: SerperRankResolveOptions,
): SerperRankMatchResult {
  const want = normPkgForSerperSnapshot(packageName);
  if (!want) return { rank: null, matchKind: "none", matchScore: null };

  const visibilityItems = items.filter((item) => {
    const pos = itemPosition(item);
    return pos != null && pos >= 1 && pos <= LIVE_RANK_VISIBILITY_CEILING;
  });

  let bestPkg: SerperRankMatchResult | undefined;
  let bestTitle: SerperRankMatchResult | undefined;
  let bestEffort: SerperRankMatchResult | undefined;
  const displayName =
    normalizeCompetitorDisplayName(options?.displayName) ?? options?.displayName ?? null;
  const allowBestEffort = options?.bestEffortTitleMatch !== false && Boolean(displayName);

  for (const item of visibilityItems) {
    const pos = itemPosition(item)!;

    if (itemMatchesTrackedPackage(want, item)) {
      const candidate = matchFromSerpItem(item, pos, "package", 1);
      if (!bestPkg || pos < bestPkg.rank!) bestPkg = candidate;
      continue;
    }

    const titleScore = scoreTitleMatchAgainstTarget(item.title, displayName, packageName);
    if (titleScore >= TITLE_SIMILARITY_THRESHOLD) {
      const candidate = matchFromSerpItem(item, pos, "title", titleScore);
      if (
        !bestTitle ||
        pos < bestTitle.rank! ||
        (pos === bestTitle.rank && titleScore > (bestTitle.matchScore ?? 0))
      ) {
        bestTitle = candidate;
      }
      continue;
    }

    if (allowBestEffort && titleScore >= BEST_EFFORT_TITLE_SIMILARITY_THRESHOLD) {
      const candidate = matchFromSerpItem(item, pos, "title", titleScore);
      if (
        !bestEffort ||
        titleScore > (bestEffort.matchScore ?? 0) ||
        (titleScore === bestEffort.matchScore && pos < bestEffort.rank!)
      ) {
        bestEffort = candidate;
      }
    }
  }

  if (bestPkg) return bestPkg;
  if (bestTitle) return bestTitle;
  if (bestEffort) return bestEffort;
  return { rank: null, matchKind: "none", matchScore: null };
}

export type SerpRankDebugTarget = {
  label: string;
  packageName: string;
  canonicalPackageId?: string | null;
  serpMatchedPackageId?: string | null;
  displayName?: string | null;
};

export type SerpRankDebugPayload = {
  topSerp: SerperTopResultWithScore[];
  matches: Array<
    SerperRankMatchResult & {
      label: string;
      packageName: string;
    }
  >;
};

/** Re-assign 1..n positions after merging multi-query / multi-page SERP slices. */
export function reindexSerpItemsByMergedOrder<T extends { position: number | string }>(
  items: readonly T[],
): T[] {
  return items.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

/** Debug bundle for live-rank / refresh when resolution is weak. */
export function buildSerpRankDebugPayload(
  items: readonly SerperRankItem[],
  targets: readonly SerpRankDebugTarget[],
  options?: { serpLimit?: number },
): SerpRankDebugPayload {
  const primary = targets[0];
  const topSerp = primary
    ? formatSerperTopResultsWithMatchScores(
        items,
        { packageName: primary.packageName, displayName: primary.displayName },
        options?.serpLimit ?? 10,
      )
    : formatSerperTopResultsForLog(items, options?.serpLimit ?? 10).map((row) => ({
        ...row,
        matchScore: 0,
      }));

  const matches = targets.map((t) => {
    const lookup = serpLookupForPackage(
      t.packageName,
      t.canonicalPackageId,
      t.serpMatchedPackageId,
    );
    const result = findBestRankInSerpItems(items, lookup.serpLookupPackageId, {
      displayName: t.displayName,
      bestEffortTitleMatch: true,
    });
    return {
      label: t.label,
      packageName: lookup.internalPackageId,
      serpLookupPackageId: lookup.serpLookupPackageId,
      lookupSource: lookup.lookupSource,
      usedCanonical: lookup.usedCanonical,
      ...result,
    };
  });

  return { topSerp, matches };
}

/** Log top SERP slice + target matches when rank is missing or weak. */
export function logPoorSerpRankDebug(
  logPrefix: string,
  context: Record<string, unknown>,
  items: readonly SerperRankItem[],
  targets: readonly SerpRankDebugTarget[],
): void {
  const payload = buildSerpRankDebugPayload(items, targets, { serpLimit: 10 });
  const hasPoor = payload.matches.some((m) => m.rank == null);
  if (!hasPoor) return;
  console.log(`[${logPrefix}] poor rank match debug`, {
    ...context,
    topSerp: payload.topSerp,
    matches: payload.matches,
  });
}

/**
 * Resolves a single integer rank for `keyword_rank_snapshots.rank`
 * Prefer primaryMarket, else best position across countries.
 */
export function resolveRankForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  primaryMarket: string,
  options?: SerperRankResolveOptions,
): number {
  const want = normPkgForSerperSnapshot(packageName);
  if (!want) return SERPER_RANK_NOT_IN_FIRST_PAGE;

  const primary = normMarket(primaryMarket);
  let primaryHit: number | undefined;
  const others: number[] = [];

  for (const block of results) {
    if (block.error) continue;
    const country = normMarket(block.country);
    const { rank } = findBestRankInSerpItems(block.items, packageName, options);
    if (rank == null) continue;

    if (country === primary) {
      if (primaryHit === undefined || rank < primaryHit) primaryHit = rank;
    } else {
      others.push(rank);
    }
  }

  if (primaryHit != null) return primaryHit;
  if (others.length === 0) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  return Math.min(...others);
}

/**
 * Rank for one country. Returns `null` when the app is not in the organic slice.
 */
export function resolveRankMatchInCountryForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  countryCode: string,
  options?: SerperRankResolveOptions,
): SerperRankMatchResult {
  const cc = normMarket(countryCode);
  const block = results.find((b) => normMarket(b.country) === cc);
  if (!block || block.error) {
    return { rank: null, matchKind: "none", matchScore: null };
  }

  const lookup = serpLookupForPackage(
    packageName,
    options?.canonicalPackageId,
    options?.serpMatchedPackageId,
  );
  if (options?.warnIfMissingCanonical && lookup.lookupSource === "internal") {
    warnWhenMissingCanonicalPackageId(options.logPrefix ?? "serper-rank-resolve", {
      label: options.logLabel ?? lookup.internalPackageId,
      internalPackageId: lookup.internalPackageId,
      displayName: options.displayName,
    });
  }

  return findBestRankInSerpItems(block.items, lookup.serpLookupPackageId, {
    displayName: options?.displayName,
    bestEffortTitleMatch: options?.bestEffortTitleMatch,
  });
}

export function resolveRankInCountryForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  countryCode: string,
  options?: SerperRankResolveOptions,
): number | null {
  return resolveRankMatchInCountryForSerperSnapshot(
    results,
    packageName,
    countryCode,
    options,
  ).rank;
}

/** API / vault — organic position, or `null` when not in the returned SERP slice. */
export function rankForClientDisplay(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (raw >= SERPER_RANK_NOT_IN_FIRST_PAGE) return null;
  return raw;
}

/** DB `keyword_rank_snapshots.rank` — column is NOT NULL. */
export function rankForSnapshotInsert(raw: number | null | undefined): number {
  if (raw == null) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  if (raw >= SERPER_RANK_NOT_IN_FIRST_PAGE) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  return raw;
}

/** Live-rank API: cap visibility window and attach a machine-readable reason. */
export function applyLiveRankClientPolicy(rawRank: number | null): {
  rank: number | null;
  not_ranked_reason?: LiveRankNotRankedReason;
} {
  if (rawRank == null) {
    return { rank: null, not_ranked_reason: "not_in_serp" };
  }
  if (rawRank > LIVE_RANK_VISIBILITY_CEILING) {
    return { rank: null, not_ranked_reason: "outside_visibility_window" };
  }
  return { rank: rawRank };
}

/** Client preview rows: same package matching as rank snapshot resolution. */
export function serperPreviewRowMatchesWorkspacePackage(
  workspacePackageName: string | null | undefined,
  item: { packageId: string | null; link?: string; title?: string },
  options?: SerperRankResolveOptions,
): boolean {
  const want = normPkgForSerperSnapshot(workspacePackageName);
  if (!want) return false;
  if (itemMatchesTrackedPackage(want, item)) return true;
  if (
    options?.displayName &&
    itemTitleMatchesDisplayName(item.title, options.displayName, workspacePackageName)
  ) {
    return true;
  }
  return false;
}
