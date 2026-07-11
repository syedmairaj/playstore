import type { KeywordCategory } from "@/lib/listing/keyword-strategy-parse";
import { parseKeyword } from "@/lib/listing/keyword-strategy-parse";
import type { TrackedKeywordSignalInput } from "@/lib/types/listing";
import type { KeywordIntelligenceItem } from "@/lib/validation/listing-output";

const QUICK_WIN_MAX_DIFFICULTY = 30;
const QUICK_WIN_MIN_VOLUME = 1_000;
const HIGH_ROI_MIN_VOLUME = 5_000;

function clampScore(n: number, max = 100): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\u0600-\u06FF]+/)
      .filter((t) => t.length >= 3),
  );
}

/** Heuristic relevance: keyword token overlap with app features + category. */
export function estimateRelevanceMatch(
  keyword: string,
  appFeatures: string,
  category: string,
): number {
  const kwTokens = tokenize(keyword);
  if (kwTokens.size === 0) return 50;
  const corpus = tokenize(`${appFeatures} ${category}`);
  if (corpus.size === 0) return 60;
  let hits = 0;
  for (const t of kwTokens) {
    if (corpus.has(t)) hits += 1;
  }
  return clampScore(40 + (hits / kwTokens.size) * 60);
}

function estimateDifficulty(keyword: string, tracked?: TrackedKeywordSignalInput): number {
  if (typeof tracked?.difficulty === "number" && Number.isFinite(tracked.difficulty)) {
    return clampScore(tracked.difficulty);
  }
  const words = keyword.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 4) return 22;
  if (words === 3) return 35;
  if (words === 2) return 52;
  return 68;
}

function estimateVolume(keyword: string, tracked?: TrackedKeywordSignalInput): number | undefined {
  if (typeof tracked?.searchVolume === "number" && tracked.searchVolume > 0) {
    return Math.round(tracked.searchVolume);
  }
  return undefined;
}

function defaultRoiRationale(
  keyword: string,
  cluster: KeywordCategory,
  searchVolume?: number,
  difficultyScore?: number,
  relevanceMatch?: number,
): string {
  const parts: string[] = [];
  if (cluster === "gap") {
    parts.push("Competitor-gap term — targets users switching from rival apps.");
  } else if (cluster === "competitive") {
    parts.push("High-volume cluster — use in title/short for reach.");
  } else if (cluster === "intent") {
    parts.push("Intent cluster — long-tail discovery in full description.");
  }
  if (searchVolume != null && searchVolume >= HIGH_ROI_MIN_VOLUME) {
    parts.push(`~${searchVolume.toLocaleString()}/mo search demand.`);
  } else if (searchVolume != null && searchVolume >= QUICK_WIN_MIN_VOLUME) {
    parts.push(`Long-tail volume ~${searchVolume.toLocaleString()}/mo.`);
  }
  if (
    difficultyScore != null &&
    searchVolume != null &&
    searchVolume >= QUICK_WIN_MIN_VOLUME &&
    difficultyScore <= QUICK_WIN_MAX_DIFFICULTY
  ) {
    parts.push("Quick-win profile (volume >1k, difficulty <30).");
  }
  if (relevanceMatch != null && relevanceMatch >= 75) {
    parts.push("Strong utility match — low spam risk.");
  } else if (relevanceMatch != null && relevanceMatch < 50) {
    parts.push("Relevance weak — use sparingly or refine.");
  }
  return (parts.join(" ") || `Supports ${cluster} ASO cluster for ${keyword}.`).slice(0, 300);
}

function findTrackedSignal(
  keyword: string,
  tracked?: TrackedKeywordSignalInput[],
): TrackedKeywordSignalInput | undefined {
  if (!tracked?.length) return undefined;
  const norm = keyword.trim().toLowerCase();
  return tracked.find((s) => s.keyword.trim().toLowerCase() === norm);
}

export type EnrichKeywordIntelligenceInput = {
  keywordSuggestions: string[];
  appFeatures: string;
  category: string;
  trackedKeywordSignals?: TrackedKeywordSignalInput[];
  modelIntelligence?: KeywordIntelligenceItem[];
};

/**
 * Build standardized ROI intelligence for multi-tenant workspaces.
 * Merges model output with Keyword Tracker signals and heuristics.
 */
export function enrichKeywordIntelligence(
  input: EnrichKeywordIntelligenceInput,
): KeywordIntelligenceItem[] {
  const modelByKeyword = new Map(
    (input.modelIntelligence ?? []).map((item) => [
      item.keyword.trim().toLowerCase(),
      item,
    ]),
  );

  const seen = new Set<string>();
  const items: KeywordIntelligenceItem[] = [];

  for (const raw of input.keywordSuggestions) {
    const parsed = parseKeyword(raw);
    const key = parsed.keyword.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const cluster =
      parsed.category === "general" ? ("intent" as const) : parsed.category;
    const tracked = findTrackedSignal(parsed.keyword, input.trackedKeywordSignals);
    const fromModel = modelByKeyword.get(key);

    const searchVolume =
      fromModel?.searchVolume ?? estimateVolume(parsed.keyword, tracked);
    const difficultyScore =
      fromModel?.difficultyScore ?? estimateDifficulty(parsed.keyword, tracked);
    const relevanceMatch =
      fromModel?.relevanceMatch ??
      estimateRelevanceMatch(parsed.keyword, input.appFeatures, input.category);

    items.push({
      keyword: parsed.keyword,
      cluster,
      ...(searchVolume != null ? { searchVolume } : {}),
      difficultyScore,
      relevanceMatch,
      roiRationale:
        fromModel?.roiRationale?.trim() ||
        defaultRoiRationale(
          parsed.keyword,
          cluster,
          searchVolume,
          difficultyScore,
          relevanceMatch,
        ),
    });
  }

  return items.slice(0, 20);
}

export function isQuickWinKeyword(item: KeywordIntelligenceItem): boolean {
  return (
    (item.searchVolume ?? 0) >= QUICK_WIN_MIN_VOLUME &&
    (item.difficultyScore ?? 100) <= QUICK_WIN_MAX_DIFFICULTY
  );
}
