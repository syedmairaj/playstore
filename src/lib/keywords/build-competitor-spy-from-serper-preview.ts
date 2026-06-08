import type { SerperPreviewCountry, SerperPreviewItem } from "@/lib/keywords/serper-preview-types";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import {
  effectiveSerperPreviewItemPackage,
  normPkgForSerperSnapshot,
  serperPreviewRowMatchesWorkspacePackage,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

export type CompetitorSpySharedRow = {
  keyword: string;
  yourRank: number | null;
  theirRank: number;
};

export type CompetitorSpyGap = { keyword: string; opportunity: "high" | "medium" };

export type CompetitorSpyQuickWinPlan =
  | { key: "tplTrail"; keyword: string; yourRank: number; theirRank: number }
  | { key: "tplAbsent"; keyword: string }
  | { key: "tplAhead"; keyword: string; yourRank: number; theirRank: number }
  | { key: "tplTie"; keyword: string; rank: number }
  | { key: "tplGap"; term: string };

export type BuiltCompetitorSpyAnalysis = {
  query: string;
  displayName: string;
  packageId: string;
  topKeywords: string[];
  shared: CompetitorSpySharedRow[];
  quickWinPlans: CompetitorSpyQuickWinPlan[];
  quickWinTerms: string[];
  gaps: CompetitorSpyGap[];
};

/** Workspace Keyword Tracker hints (primary-market latest rank). */
export type TrackedKeywordRankHint = {
  term: string;
  yourRank: number | null;
};

const STOPWORDS = new Set([
  "app",
  "apps",
  "free",
  "android",
  "google",
  "play",
  "store",
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "you",
  "pro",
  "plus",
  "new",
  "best",
  "top",
  "download",
  "mobile",
  "game",
  "games",
]);

function minRankForPackageInResults(
  results: SerperPreviewCountry[],
  packageNorm: string | null,
): number | null {
  if (!packageNorm) return null;
  let best: number | null = null;
  for (const block of results) {
    if (block.error) continue;
    for (const it of block.items) {
      const pid = effectiveSerperPreviewItemPackage(it);
      if (pid !== packageNorm) continue;
      if (best === null || it.position < best) best = it.position;
    }
  }
  return best;
}

function minRankForWorkspacePackage(
  results: SerperPreviewCountry[],
  workspacePackage: string | null | undefined,
): number | null {
  const want = normPkgForSerperSnapshot(workspacePackage);
  if (!want) return null;
  let best: number | null = null;
  for (const block of results) {
    if (block.error) continue;
    for (const it of block.items) {
      if (!serperPreviewRowMatchesWorkspacePackage(workspacePackage, it)) continue;
      if (best === null || it.position < best) best = it.position;
    }
  }
  return best;
}

/** UI-facing rank: missing or beyond page → sentinel for `formatRankForDisplay` → "20+". */
export function yourRankForCompetitorSpyDisplay(rank: number | null | undefined): number {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  if (rank > 20 || rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return SERPER_RANK_NOT_IN_FIRST_PAGE;
  return rank;
}

/** True when both apps have a real organic position in the live preview matrix (top 20). */
export function isMeaningfulCompetitorSpyRank(rank: number | null | undefined): boolean {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) return false;
  if (rank > 20 || rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return false;
  return true;
}

/** Shared overlap rows: both workspace app and competitor must rank in the preview slice. */
export function filterSharedRowsBothSidesTracked(
  rows: CompetitorSpySharedRow[],
): CompetitorSpySharedRow[] {
  return rows.filter(
    (row) =>
      isMeaningfulCompetitorSpyRank(row.yourRank) &&
      isMeaningfulCompetitorSpyRank(row.theirRank),
  );
}

function pickCompetitorFromResults(
  results: SerperPreviewCountry[],
  query: string,
): { item: SerperPreviewItem; packageId: string; displayName: string } | null {
  const trimmed = query.trim();
  const wantPkg = trimmed.includes(".") ? normPkgForSerperSnapshot(trimmed) : null;

  for (const block of results) {
    if (block.error || block.items.length === 0) continue;

    if (wantPkg) {
      for (const it of block.items) {
        const pid = effectiveSerperPreviewItemPackage(it);
        if (!pid) continue;
        if (pid === wantPkg) {
          return { item: it, packageId: pid, displayName: it.title.trim() || trimmed };
        }
      }
    }

    for (const it of [...block.items].sort((a, b) => a.position - b.position)) {
      const pid = effectiveSerperPreviewItemPackage(it);
      if (!pid) continue;
      return { item: it, packageId: pid, displayName: it.title.trim() || trimmed };
    }
  }

  return null;
}

function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function titleToGapKeyword(title: string): string | null {
  const words = tokenizeTitle(title);
  if (words.length === 0) return null;
  if (words.length >= 2) return words.slice(0, 3).join(" ");
  return words[0] ?? null;
}

function bigramsFromTitle(title: string): string[] {
  const words = tokenizeTitle(title);
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    out.push(`${words[i]} ${words[i + 1]}`);
  }
  if (words.length >= 3) {
    out.push(`${words[0]} ${words[1]} ${words[2]}`);
  }
  return out;
}

function uniqueGapKeywords(sources: string[], limit: number): CompetitorSpyGap[] {
  const seen = new Set<string>();
  const out: CompetitorSpyGap[] = [];
  let i = 0;
  for (const raw of sources) {
    const kw = raw.trim();
    if (kw.length < 3) continue;
    const k = kw.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ keyword: kw, opportunity: i % 2 === 0 ? "high" : "medium" });
    i += 1;
    if (out.length >= limit) break;
  }
  return out;
}

function topKeywordsFromCompetitor(title: string, snippet: string | null, limit: number): string[] {
  const fromTitle = tokenizeTitle(title);
  const fromSnippet = snippet ? tokenizeTitle(snippet) : [];
  const merged = [...fromTitle, ...fromSnippet, ...bigramsFromTitle(title)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of merged) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

function collectGapKeywordSources(
  results: SerperPreviewCountry[],
  compPkg: string,
  workspacePackage: string | null | undefined,
  competitorTitle: string,
  competitorSnippet: string | null,
  queryLabel: string,
): string[] {
  const sources: string[] = [];
  const q = queryLabel.trim();
  if (q.length >= 3) sources.push(q);

  for (const phrase of bigramsFromTitle(competitorTitle)) sources.push(phrase);
  for (const w of tokenizeTitle(competitorTitle)) sources.push(w);
  if (competitorSnippet) {
    for (const w of tokenizeTitle(competitorSnippet)) sources.push(w);
  }

  for (const block of results) {
    if (block.error) continue;
    for (const it of block.items) {
      const pid = effectiveSerperPreviewItemPackage(it);
      if (!pid || pid === compPkg) continue;
      if (serperPreviewRowMatchesWorkspacePackage(workspacePackage, it)) continue;
      const title = it.title.trim();
      if (!title) continue;
      const gapKw = titleToGapKeyword(title);
      if (gapKw) sources.push(gapKw);
      for (const bg of bigramsFromTitle(title)) sources.push(bg);
      if (it.snippet?.trim()) {
        for (const w of tokenizeTitle(it.snippet)) sources.push(w);
      }
    }
  }

  return sources;
}

/** Labels for overlap table rows when both apps rank on the same live preview slice. */
function discoverSharedOverlapKeywordLabels(
  results: SerperPreviewCountry[],
  queryLabel: string,
  competitorTitle: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const kw = raw.trim();
    if (kw.length < 2) return;
    const key = kw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(kw);
  };

  push(queryLabel);
  for (const phrase of bigramsFromTitle(competitorTitle)) push(phrase);
  for (const w of tokenizeTitle(competitorTitle)) push(w);

  for (const block of results) {
    if (block.error) continue;
    for (const it of block.items) {
      const title = it.title.trim();
      if (!title) continue;
      const gapKw = titleToGapKeyword(title);
      if (gapKw) push(gapKw);
      for (const bg of bigramsFromTitle(title)) push(bg);
    }
  }

  return out.slice(0, 16);
}

function mergeSharedRows(
  rows: CompetitorSpySharedRow[],
  keyword: string,
  yourRank: number | null,
  theirRank: number,
): CompetitorSpySharedRow[] {
  const k = keyword.trim();
  if (!k) return rows;
  const key = k.toLowerCase();
  const yourDisplay = yourRankForCompetitorSpyDisplay(yourRank);
  const existing = rows.find((r) => r.keyword.toLowerCase() === key);
  if (existing) {
    return rows.map((r) =>
      r.keyword.toLowerCase() === key
        ? {
            keyword: r.keyword,
            yourRank:
              yourDisplay < (r.yourRank ?? SERPER_RANK_NOT_IN_FIRST_PAGE)
                ? yourDisplay
                : yourRankForCompetitorSpyDisplay(r.yourRank),
            theirRank: Math.min(r.theirRank, theirRank),
          }
        : r,
    );
  }
  return [...rows, { keyword: k, yourRank: yourDisplay, theirRank }];
}

function quickWinForKeyword(
  keyword: string,
  yourRank: number | null,
  theirRank: number | null,
): CompetitorSpyQuickWinPlan | null {
  if (theirRank == null) return null;
  const yourDisplay = yourRankForCompetitorSpyDisplay(yourRank);
  if (yourDisplay >= SERPER_RANK_NOT_IN_FIRST_PAGE) {
    return { key: "tplAbsent", keyword };
  }
  if (yourDisplay < theirRank) {
    return { key: "tplAhead", keyword, yourRank: yourDisplay, theirRank };
  }
  if (yourDisplay > theirRank) {
    return { key: "tplTrail", keyword, yourRank: yourDisplay, theirRank };
  }
  return { key: "tplTie", keyword, rank: yourDisplay };
}

/**
 * Derive Competitor Spy insight rows from a live Serper preview (site-restricted Play Store).
 */
export function buildCompetitorSpyAnalysisFromPreview(input: {
  query: string;
  results: SerperPreviewCountry[];
  workspacePackage: string | null | undefined;
  trackedKeywords?: TrackedKeywordRankHint[];
}): BuiltCompetitorSpyAnalysis | null {
  const picked = pickCompetitorFromResults(input.results, input.query);
  if (!picked) return null;

  const compPkg = picked.packageId;
  const keywordLabel = input.query.trim();
  const theirBest = minRankForPackageInResults(input.results, compPkg);
  const yourBest = minRankForWorkspacePackage(input.results, input.workspacePackage);

  let shared: CompetitorSpySharedRow[] = [];
  if (
    theirBest != null &&
    isMeaningfulCompetitorSpyRank(theirBest) &&
    isMeaningfulCompetitorSpyRank(yourBest)
  ) {
    const overlapLabels = discoverSharedOverlapKeywordLabels(
      input.results,
      keywordLabel,
      picked.item.title,
    );
    for (const label of overlapLabels) {
      shared = mergeSharedRows(shared, label, yourBest, theirBest);
    }
  } else if (theirBest != null) {
    shared = mergeSharedRows(shared, keywordLabel, yourBest, theirBest);
  }

  const topKeywords = topKeywordsFromCompetitor(
    picked.item.title,
    picked.item.snippet,
    8,
  );

  const tracked = input.trackedKeywords ?? [];

  shared = filterSharedRowsBothSidesTracked(shared).sort((a, b) =>
    a.keyword.localeCompare(b.keyword),
  );

  const quickWinPlans: CompetitorSpyQuickWinPlan[] = [];
  if (theirBest != null) {
    const primary = quickWinForKeyword(keywordLabel, yourBest, theirBest);
    if (primary) quickWinPlans.push(primary);
  }

  for (const row of shared) {
    if (row.keyword.toLowerCase() === keywordLabel.toLowerCase()) continue;
    const plan = quickWinForKeyword(row.keyword, row.yourRank, row.theirRank);
    if (plan && !quickWinPlans.some((p) => ("keyword" in p ? p.keyword : p.term) === row.keyword)) {
      quickWinPlans.push(plan);
    }
    if (quickWinPlans.length >= 6) break;
  }

  const gapSources = collectGapKeywordSources(
    input.results,
    compPkg,
    input.workspacePackage,
    picked.item.title,
    picked.item.snippet,
    keywordLabel,
  );

  for (const tk of tracked) {
    const term = tk.term.trim();
    if (term.length < 2) continue;
    const yr = yourRankForCompetitorSpyDisplay(tk.yourRank);
    if (yr >= SERPER_RANK_NOT_IN_FIRST_PAGE || (tk.yourRank != null && tk.yourRank > 10)) {
      gapSources.push(term);
    }
  }

  const sharedKeys = new Set(shared.map((s) => s.keyword.toLowerCase()));
  const filteredGapSources = gapSources.filter((s) => !sharedKeys.has(s.trim().toLowerCase()));

  const gaps = uniqueGapKeywords(filteredGapSources, 12);
  if (gaps[0] && !quickWinPlans.some((p) => p.key === "tplGap")) {
    quickWinPlans.push({ key: "tplGap", term: gaps[0].keyword });
  }

  if (quickWinPlans.length === 0 && gaps[0]) {
    quickWinPlans.push({ key: "tplGap", term: gaps[0].keyword });
  }

  const quickWinTerms =
    quickWinPlans.length > 0
      ? quickWinPlans.map((p) => (p.key === "tplGap" ? p.term : p.keyword))
      : gaps.length > 0
        ? [gaps[0]!.keyword]
        : [keywordLabel];

  return {
    query: keywordLabel,
    displayName: picked.displayName,
    packageId: compPkg,
    topKeywords,
    shared,
    quickWinPlans,
    quickWinTerms,
    gaps,
  };
}
