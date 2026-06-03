import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One-time “before optimization” anchor when a keyword first gets a measurable
 * primary-market rank. Does not overwrite once `aso_baseline_captured_at` is set.
 */
export async function captureKeywordAsoBaselineIfUnset(
  supabase: SupabaseClient,
  params: {
    keywordId: string;
    candidateRank: number | null;
    source: "initial_save";
  },
): Promise<void> {
  const rk = params.candidateRank;
  if (rk == null || !Number.isFinite(rk)) return;

  const { data: row } = await supabase
    .from("keywords")
    .select("id")
    .eq("id", params.keywordId)
    .is("aso_baseline_captured_at", null)
    .maybeSingle();

  if (!row) return;

  await supabase
    .from("keywords")
    .update({
      aso_baseline_rank: Math.round(rk),
      aso_baseline_captured_at: new Date().toISOString(),
      aso_baseline_source: params.source,
    })
    .eq("id", params.keywordId);
}
