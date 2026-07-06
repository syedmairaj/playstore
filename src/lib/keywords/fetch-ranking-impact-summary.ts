import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingColumnError,
  KEYWORDS_SELECT_WITH_ASO_ROI,
} from "@/lib/keywords/keywords-select-columns";

const RECENT_GAIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_POSITION_GAIN = 5;

export type RankingImpactSummary = {
  /** Average relative rank improvement (%) across recent keyword gains. */
  averageImprovementPercent: number;
  /** Keywords contributing to the average. */
  keywordCount: number;
};

/**
 * Summarize recent keyword ranking improvements for the billing dashboard.
 * Uses `recent_rank_gain` within the same 7-day window as the keyword tracker badge.
 */
export async function fetchRankingImpactSummary(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<RankingImpactSummary> {
  let { data, error } = await supabase
    .from("keywords")
    .select(KEYWORDS_SELECT_WITH_ASO_ROI)
    .eq("workspace_id", workspaceId);

  if (
    error &&
    (isMissingColumnError(error.message, "recent_rank_gain") ||
      isMissingColumnError(error.message, "recent_rank_gain_at"))
  ) {
    return { averageImprovementPercent: 0, keywordCount: 0 };
  }

  if (error || !data) {
    return { averageImprovementPercent: 0, keywordCount: 0 };
  }

  const now = Date.now();
  const percents: number[] = [];

  for (const row of data) {
    const gain = row.recent_rank_gain;
    const gainAt = row.recent_rank_gain_at;
    if (typeof gain !== "number" || !Number.isFinite(gain) || gain < MIN_POSITION_GAIN) {
      continue;
    }
    if (!gainAt || now - new Date(gainAt).getTime() > RECENT_GAIN_MAX_AGE_MS) {
      continue;
    }

    const refRank =
      typeof row.rank_at_last_listing_optimization === "number" &&
      Number.isFinite(row.rank_at_last_listing_optimization)
        ? row.rank_at_last_listing_optimization
        : typeof row.aso_baseline_rank === "number" && Number.isFinite(row.aso_baseline_rank)
          ? row.aso_baseline_rank
          : null;

    if (refRank == null || refRank <= 0) continue;

    percents.push((gain / refRank) * 100);
  }

  if (percents.length === 0) {
    return { averageImprovementPercent: 0, keywordCount: 0 };
  }

  const average =
    percents.reduce((sum, p) => sum + p, 0) / percents.length;

  return {
    averageImprovementPercent: Math.round(average * 10) / 10,
    keywordCount: percents.length,
  };
}
