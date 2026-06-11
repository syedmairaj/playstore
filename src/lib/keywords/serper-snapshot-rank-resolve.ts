import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { extractPackageIdFromPlayStoreDetailsUrl } from "@/lib/keywords/play-store-details-url";

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
  /** Play Store listing title hint — used only when package match fails (high threshold). */
  displayName?: string | null;
};

/** Ranks above this are treated as "not ranked" in live-rank API responses. */
export const LIVE_RANK_VISIBILITY_CEILING = 30;

export type LiveRankNotRankedReason = "not_in_serp" | "outside_visibility_window" | "serper_error";

export type SerperRankMatchKind = "package" | "title" | "none";

/** Strip Play Store SERP boilerplate from stored competitor listing titles. */
export function normalizeCompetitorDisplayNameForRank(
  name: string | null | undefined,
): string | null {
  if (!name || typeof name !== "string") return null;
  let t = name.trim();
  if (!t) return null;
  t = t.replace(/\s*[-–—|]\s*Apps on Google Play\s*$/i, "").trim();
  t = t.replace(/\s*on Google Play\s*$/i, "").trim();
  return t.length > 0 ? t : null;
}

const GENERIC_PACKAGE_SEGMENTS = new Set(["android", "ios", "mobile", "app", "free"]);

/** First letter for competitor avatar fallback — never use leading "C" from `com.*` package ids. */
export function competitorInitialForDisplay(
  displayName: string | null | undefined,
  packageId: string,
): string {
  const cleaned =
    normalizeCompetitorDisplayNameForRank(displayName) ?? String(displayName ?? "").trim();
  const titleLead = (cleaned.includes(":") ? cleaned.split(":")[0] : cleaned).trim();
  if (titleLead.length > 0 && !/^com\.[a-z0-9_]+/i.test(titleLead)) {
    const ch = [...titleLead][0];
    if (ch && /\p{L}/u.test(ch)) return ch.toUpperCase();
  }

  const pkg = String(packageId ?? "").trim().toLowerCase();
  const segments = pkg
    .replace(/^com\./, "")
    .split(".")
    .filter((s) => s.length > 0 && !GENERIC_PACKAGE_SEGMENTS.has(s));
  const label = segments[0] ?? pkg.replace(/^com\./, "").split(".")[0] ?? "?";
  const initial = [...label][0];
  return initial && /\p{L}/u.test(initial) ? initial.toUpperCase() : "?";
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

/** Package id from Serper row `packageId` or Play details `?id=` on `link`. */
export function effectiveSerperPreviewItemPackage(item: {
  packageId: string | null;
  link?: string;
}): string | null {
  const fromId = normPkgForSerperSnapshot(item.packageId);
  if (fromId) return fromId;
  return normPkgForSerperSnapshot(extractPackageIdFromPlayStoreDetailsUrl(item.link));
}

/** Core id segment(s) for fuzzy family matching — e.g. com.strava.android → strava. */
function packageCoreSegments(pkg: string): string[] {
  const parts = pkg.split(".").filter((p) => p.length > 0);
  if (parts.length === 0) return [];
  const skip = new Set(["com", "org", "net", "io", "app", "android"]);
  const meaningful = parts.filter((p, i) => !(i === 0 && skip.has(p)));
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
  item: { packageId: string | null; link?: string },
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

/**
 * High-threshold title match — only when package id is missing or mismatched.
 * Requires display name ≥ 4 chars and strong title overlap.
 */
export function itemTitleMatchesDisplayName(
  title: string | null | undefined,
  displayName: string | null | undefined,
): boolean {
  const nameNorm = normalizeTitleForMatch(displayName ?? "");
  if (nameNorm.length < 4) return false;

  const titleNorm = normalizeTitleForMatch(title ?? "");
  if (!titleNorm) return false;

  if (titleNorm === nameNorm) return true;

  const titleLead = titleNorm.split(/\s/)[0] ?? "";
  const nameLead = nameNorm.split(/\s/)[0] ?? "";
  if (titleLead.length >= 4 && titleLead === nameLead) return true;

  const titleBeforeSep =
    titleNorm.split(/[:\-|–—]/)[0]?.trim() ?? "";
  if (titleBeforeSep.length >= 4 && titleBeforeSep === nameNorm) return true;
  if (titleBeforeSep.length >= 4 && titleBeforeSep.startsWith(`${nameNorm} `)) return true;

  const nameTokens = nameNorm.split(" ").filter((t) => t.length >= 3);
  if (nameTokens.length === 0) return false;
  if (!nameTokens.every((tok) => titleNorm.includes(tok))) return false;

  const titleTokens = new Set(titleNorm.split(" ").filter((t) => t.length >= 3));
  const overlap = nameTokens.filter((t) => titleTokens.has(t)).length;
  const ratio = overlap / nameTokens.length;
  return ratio >= 0.85;
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

export function findBestRankInSerpItems(
  items: readonly SerperRankItem[],
  packageName: string,
  options?: SerperRankResolveOptions,
): { rank: number | null; matchKind: SerperRankMatchKind } {
  const want = normPkgForSerperSnapshot(packageName);
  if (!want) return { rank: null, matchKind: "none" };

  let bestPkg: number | undefined;
  let bestTitle: number | undefined;
  const displayName =
    normalizeCompetitorDisplayNameForRank(options?.displayName) ?? null;

  for (const item of items) {
    const pos = itemPosition(item);
    if (pos == null || pos < 1) continue;

    if (itemMatchesTrackedPackage(want, item)) {
      if (bestPkg === undefined || pos < bestPkg) bestPkg = pos;
      continue;
    }

    if (displayName && itemTitleMatchesDisplayName(item.title, displayName)) {
      if (bestTitle === undefined || pos < bestTitle) bestTitle = pos;
    }
  }

  if (bestPkg != null) return { rank: bestPkg, matchKind: "package" };
  if (bestTitle != null) return { rank: bestTitle, matchKind: "title" };
  return { rank: null, matchKind: "none" };
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
export function resolveRankInCountryForSerperSnapshot(
  results: readonly SerperCountryResultForSnapshot[],
  packageName: string,
  countryCode: string,
  options?: SerperRankResolveOptions,
): number | null {
  const cc = normMarket(countryCode);
  const block = results.find((b) => normMarket(b.country) === cc);
  if (!block || block.error) return null;
  return findBestRankInSerpItems(block.items, packageName, options).rank;
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
  if (options?.displayName && itemTitleMatchesDisplayName(item.title, options.displayName)) {
    return true;
  }
  return false;
}
