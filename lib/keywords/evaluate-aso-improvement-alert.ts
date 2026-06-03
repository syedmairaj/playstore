import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingColumnError,
} from "@/lib/keywords/keywords-select-columns";

const MIN_POSITION_GAIN = 5;
const RECENT_GAIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type KeywordOptRow = {
  id: string;
  aso_baseline_rank: number | null;
  aso_baseline_captured_at: string | null;
  last_listing_optimization_generation_id: string | null;
  rank_at_last_listing_optimization: number | null;
  recent_rank_gain?: number | null;
  recent_rank_gain_at?: string | null;
};

/**
 * After a live rank refresh, detect meaningful improvement vs the rank captured at
 * the last linked AI listing generation, falling back to the first-time baseline
 * when no rank was stored at link time. Lower rank number = better on Play.
 *
 * Inserts at most one `aso_rank_improvement` alert per keyword per linked
 * `listing_generation_id` (MVP dedupe). Always refreshes `recent_rank_gain` when
 * the threshold is met.
 */
export async function maybeCreateAsoRankImprovementAlert(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  keywordId: string;
  keywordTerm: string;
  newPrimaryRank: number | null;
}): Promise<void> {
  const { supabase, workspaceId, keywordId, keywordTerm, newPrimaryRank } = params;
  if (newPrimaryRank == null || !Number.isFinite(newPrimaryRank)) return;

  const selectFull =
    "id,aso_baseline_rank,aso_baseline_captured_at,last_listing_optimization_generation_id,rank_at_last_listing_optimization,recent_rank_gain,recent_rank_gain_at";
  const selectNoRecentBadge =
    "id,aso_baseline_rank,aso_baseline_captured_at,last_listing_optimization_generation_id,rank_at_last_listing_optimization";

  let kwRes = await supabase
    .from("keywords")
    .select(selectFull)
    .eq("id", keywordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let canPatchRecentGain = true;
  if (kwRes.error && (isMissingColumnError(kwRes.error.message, "recent_rank_gain") || isMissingColumnError(kwRes.error.message, "recent_rank_gain_at"))) {
    canPatchRecentGain = false;
    kwRes = await supabase
      .from("keywords")
      .select(selectNoRecentBadge)
      .eq("id", keywordId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
  }

  const { data: kw, error: kwErr } = kwRes;
  if (kwErr || !kw) return;
  const row = kw as KeywordOptRow;

  const now = Date.now();
  const staleGain =
    canPatchRecentGain &&
    row.recent_rank_gain_at != null &&
    now - new Date(row.recent_rank_gain_at).getTime() > RECENT_GAIN_MAX_AGE_MS;

  const patch: Record<string, unknown> = {};
  if (staleGain) {
    patch.recent_rank_gain = null;
    patch.recent_rank_gain_at = null;
  }

  const genId = row.last_listing_optimization_generation_id;
  if (!genId) {
    if (Object.keys(patch).length > 0) {
      await supabase.from("keywords").update(patch).eq("id", keywordId);
    }
    return;
  }

  /**
   * Reference “before” rank: prefer the snapshot taken when the listing generation
   * was linked; if that is missing (no ranks yet), fall back to the first baseline.
   */
  let refRank: number | null = row.rank_at_last_listing_optimization;
  if (refRank == null || !Number.isFinite(refRank)) {
    refRank =
      row.aso_baseline_rank != null && Number.isFinite(row.aso_baseline_rank)
        ? row.aso_baseline_rank
        : null;
  }
  if (refRank == null || !Number.isFinite(refRank)) {
    if (Object.keys(patch).length > 0) {
      await supabase.from("keywords").update(patch).eq("id", keywordId);
    }
    return;
  }

  const improvement = refRank - newPrimaryRank;
  if (improvement < MIN_POSITION_GAIN) {
    if (Object.keys(patch).length > 0) {
      await supabase.from("keywords").update(patch).eq("id", keywordId);
    }
    return;
  }

  const { data: dup } = await supabase
    .from("workspace_alerts")
    .select("id")
    .eq("keyword_id", keywordId)
    .eq("type", "aso_rank_improvement")
    .filter("meta->>listing_generation_id", "eq", genId)
    .maybeSingle();

  if (!dup) {
    await supabase.from("workspace_alerts").insert({
      workspace_id: workspaceId,
      keyword_id: keywordId,
      type: "aso_rank_improvement",
      title: "Rank improved after listing optimization",
      body: `Your keyword "${keywordTerm}" improved from #${refRank} to #${newPrimaryRank} after your recent AI listing optimization.`,
      severity: "info",
      meta: {
        listing_generation_id: genId,
        fromRank: refRank,
        toRank: newPrimaryRank,
        positions: improvement,
        keywordTerm,
      },
    });
  }

  if (canPatchRecentGain) {
    patch.recent_rank_gain = improvement;
    patch.recent_rank_gain_at = new Date().toISOString();
  }
  await supabase.from("keywords").update(patch).eq("id", keywordId);
}
