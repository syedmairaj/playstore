import type { SupabaseClient } from "@supabase/supabase-js";

const WORSEN_BY = 3;

/**
 * Compare previous and new rank snapshots (lower rank number = better on Google Play).
 * Inserts workspace_alerts when thresholds are crossed.
 */
export async function maybeCreateRankAlerts(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  keywordId: string;
  keywordTerm: string;
  prevRank: number | null;
  newRank: number | null;
}): Promise<void> {
  const { supabase, workspaceId, keywordId, keywordTerm, prevRank, newRank } =
    params;

  if (newRank == null) return;

  if (prevRank != null) {
    if (newRank > prevRank + WORSEN_BY) {
      await supabase.from("workspace_alerts").insert({
        workspace_id: workspaceId,
        keyword_id: keywordId,
        type: "rank_drop",
        title: "Ranking slipped",
        body: `“${keywordTerm}” moved from #${prevRank} to #${newRank}. Consider refreshing your listing or creatives.`,
        severity: "warning",
        meta: { prevRank, newRank },
      });
      return;
    }
  }

  if (prevRank != null && prevRank <= 10 && newRank > 10) {
    await supabase.from("workspace_alerts").insert({
      workspace_id: workspaceId,
      keyword_id: keywordId,
      type: "rank_threshold",
      title: "Dropped out of top 10",
      body: `“${keywordTerm}” is now #${newRank}. You were previously in the top 10.`,
      severity: "info",
      meta: { prevRank, newRank },
    });
  }
}
