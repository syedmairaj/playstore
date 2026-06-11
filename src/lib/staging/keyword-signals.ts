/**
 * Keyword Signals — vault parsing and grouping for Active Context panel.
 *
 * Reads from state_{locale}.features.keyword_validator.signals.[keyword]
 * EN dashboard → state_en; AR dashboard → state_ar (via vaultLocale).
 * tracked_competitor_ranks on live_ranks.[market] is locale-scoped like other vault fields.
 */

export interface KeywordSignalLiveRank {
  rank: number | null;
  fetched_at: string;
  /** package_name → organic rank for workspace Competitor Spy slots */
  tracked_competitor_ranks?: Record<string, number | null>;
  not_ranked_reason?: "not_in_serp" | "outside_visibility_window" | "serper_error";
  error?: string;
}

export interface KeywordSignal {
  keyword: string;
  difficulty: number;
  confidence: number;
  searchVolume: number;
  competition?: number;
  recommendation?: string;
  liveRanks?: Record<string, KeywordSignalLiveRank>;
  stagedAt?: string;
  lastFetchedAt?: string;
}

export type KeywordSignalGroup = "high_confidence" | "medium_opportunity" | "live_rank_watchlist";

export interface GroupedKeywordSignals {
  highConfidence: KeywordSignal[];
  mediumOpportunity: KeywordSignal[];
  liveRankWatchlist: KeywordSignal[];
  other: KeywordSignal[];
  total: number;
}

const REC_HIGH = new Set(["HIGH_CONFIDENCE", "high_confidence"]);
const REC_MEDIUM = new Set(["MEDIUM_OPPORTUNITY", "medium_opportunity"]);

/** Difficulty 0–10 → Easy / Medium / Hard badge */
export function difficultyBadge(value: number): {
  label: "Easy" | "Medium" | "Hard";
  color: string;
  bg: string;
  border: string;
} {
  if (value <= 3) {
    return {
      label: "Easy",
      color: "#6ee7b7",
      bg: "rgba(16,185,129,0.1)",
      border: "rgba(16,185,129,0.3)",
    };
  }
  if (value <= 6) {
    return {
      label: "Medium",
      color: "#fcd34d",
      bg: "rgba(245,158,11,0.1)",
      border: "rgba(245,158,11,0.3)",
    };
  }
  return {
    label: "Hard",
    color: "#fca5a5",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
  };
}

export function formatSearchVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Normalise a single vault signal entry */
function normaliseSignalEntry(
  keywordKey: string,
  raw: Record<string, unknown>
): KeywordSignal | null {
  const keyword =
    typeof raw.keyword === "string" && raw.keyword.trim()
      ? raw.keyword.trim()
      : keywordKey.trim();
  if (!keyword) return null;

  const difficulty =
    typeof raw.difficulty === "number"
      ? raw.difficulty
      : typeof raw.difficulty_score === "number"
        ? raw.difficulty_score
        : 5;

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;

  const searchVolume =
    typeof raw.search_volume === "number"
      ? raw.search_volume
      : typeof raw.searchVolume === "number"
        ? raw.searchVolume
        : 0;

  const liveRanksRaw = raw.live_ranks as Record<string, Record<string, unknown>> | undefined;
  let liveRanks: Record<string, KeywordSignalLiveRank> | undefined;
  if (liveRanksRaw && Object.keys(liveRanksRaw).length > 0) {
    liveRanks = {};
    for (const [market, entry] of Object.entries(liveRanksRaw)) {
      if (!entry || typeof entry !== "object") continue;
      const rank =
        typeof entry.rank === "number" || entry.rank === null ? entry.rank : null;
      const fetched_at =
        typeof entry.fetched_at === "string" ? entry.fetched_at : "";
      if (!fetched_at) continue;
      const trackedRaw = entry.tracked_competitor_ranks;
      let tracked_competitor_ranks: Record<string, number | null> | undefined;
      if (trackedRaw && typeof trackedRaw === "object" && !Array.isArray(trackedRaw)) {
        tracked_competitor_ranks = {};
        for (const [pkg, rk] of Object.entries(trackedRaw)) {
          if (typeof rk === "number" || rk === null) {
            tracked_competitor_ranks[pkg] = rk;
          }
        }
        if (Object.keys(tracked_competitor_ranks).length === 0) {
          tracked_competitor_ranks = undefined;
        }
      }
      const notRankedReason = entry.not_ranked_reason;
      liveRanks[market] = {
        rank,
        fetched_at,
        ...(tracked_competitor_ranks ? { tracked_competitor_ranks } : {}),
        ...(notRankedReason === "not_in_serp" ||
        notRankedReason === "outside_visibility_window" ||
        notRankedReason === "serper_error"
          ? { not_ranked_reason: notRankedReason }
          : {}),
        ...(typeof entry.error === "string" ? { error: entry.error } : {}),
      };
    }
    if (Object.keys(liveRanks).length === 0) liveRanks = undefined;
  }

  return {
    keyword,
    difficulty,
    confidence,
    searchVolume,
    competition: typeof raw.competition === "number" ? raw.competition : undefined,
    recommendation:
      typeof raw.recommendation === "string" ? raw.recommendation : undefined,
    liveRanks: liveRanks && Object.keys(liveRanks).length > 0 ? liveRanks : undefined,
    stagedAt: typeof raw.staged_at === "string" ? raw.staged_at : undefined,
    lastFetchedAt:
      typeof raw.last_fetched_at === "string" ? raw.last_fetched_at : undefined,
  };
}

/**
 * Parse keyword_validator.signals map from a locale state branch.
 * Dual-locale safe: caller passes the correct state_en or state_ar object.
 */
export function parseKeywordSignalsFromState(
  state: Record<string, unknown> | null | undefined
): KeywordSignal[] {
  if (!state || typeof state !== "object") return [];

  const features = (state.features ?? {}) as Record<string, unknown>;
  const kvFeature = (features.keyword_validator ?? {}) as Record<string, unknown>;
  const signals = (kvFeature.signals ?? {}) as Record<string, Record<string, unknown>>;

  const parsed: KeywordSignal[] = [];
  for (const [key, entry] of Object.entries(signals)) {
    if (!entry || typeof entry !== "object") continue;
    const signal = normaliseSignalEntry(key, entry);
    if (signal) parsed.push(signal);
  }

  return parsed.sort((a, b) => b.confidence - a.confidence);
}

export function hasLiveRanks(signal: KeywordSignal): boolean {
  return Boolean(signal.liveRanks && Object.keys(signal.liveRanks).length > 0);
}

export function groupKeywordSignals(signals: KeywordSignal[]): GroupedKeywordSignals {
  const highConfidence: KeywordSignal[] = [];
  const mediumOpportunity: KeywordSignal[] = [];
  const liveRankWatchlist: KeywordSignal[] = [];
  const categorized = new Set<string>();

  for (const signal of signals) {
    const rec = signal.recommendation?.toUpperCase().replace(/-/g, "_") ?? "";

    if (signal.confidence >= 75 || REC_HIGH.has(rec) || REC_HIGH.has(signal.recommendation ?? "")) {
      highConfidence.push(signal);
      categorized.add(signal.keyword);
    } else if (
      (signal.confidence >= 50 && signal.confidence < 75) ||
      REC_MEDIUM.has(rec) ||
      REC_MEDIUM.has(signal.recommendation ?? "")
    ) {
      mediumOpportunity.push(signal);
      categorized.add(signal.keyword);
    }

    if (hasLiveRanks(signal)) {
      liveRankWatchlist.push(signal);
    }
  }

  const other = signals.filter((s) => !categorized.has(s.keyword));

  return {
    highConfidence,
    mediumOpportunity,
    liveRankWatchlist,
    other,
    total: signals.length,
  };
}

/** Compact live-rank labels for row display, e.g. "US: #12" */
export function formatLiveRankIndicators(
  liveRanks: Record<string, KeywordSignalLiveRank> | undefined,
  maxMarkets = 3
): string[] {
  if (!liveRanks) return [];

  return Object.entries(liveRanks)
    .slice(0, maxMarkets)
    .map(([market, data]) => {
      const code = market.toUpperCase();
      if (data.rank != null) return `${code}: #${data.rank}`;
      return `${code}: —`;
    });
}
