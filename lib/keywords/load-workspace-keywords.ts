import type { SupabaseClient } from "@supabase/supabase-js";

export type KeywordWithRanks = {
  id: string;
  term: string;
  market: string;
  locale: string;
  created_at: string;
  app_id: string;
  ranks: { rank: number | null; captured_at: string }[];
  latest: { rank: number | null; captured_at: string } | null;
};

export async function loadWorkspaceKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ ok: true; keywords: KeywordWithRanks[] } | { ok: false; message: string }> {
  const { data: keywords, error } = await supabase
    .from("keywords")
    .select("id,term,market,locale,created_at,app_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, message: error.message };
  }

  const ids = (keywords ?? []).map((k) => k.id);
  const ranksByKeyword: Record<
    string,
    { rank: number | null; captured_at: string }[]
  > = {};

  if (ids.length > 0) {
    const { data: ranks, error: rankErr } = await supabase
      .from("keyword_ranks")
      .select("keyword_id,rank,captured_at")
      .in("keyword_id", ids)
      .order("captured_at", { ascending: false })
      .limit(8000);

    if (rankErr) {
      return { ok: false, message: rankErr.message };
    }

    for (const r of ranks ?? []) {
      const kid = r.keyword_id as string;
      if (!ranksByKeyword[kid]) ranksByKeyword[kid] = [];
      if (ranksByKeyword[kid].length < 40) {
        ranksByKeyword[kid].push({
          rank: r.rank as number | null,
          captured_at: r.captured_at as string,
        });
      }
    }
  }

  const payload: KeywordWithRanks[] = (keywords ?? []).map((k) => {
    const desc = ranksByKeyword[k.id] ?? [];
    return {
      id: k.id,
      term: k.term,
      market: k.market,
      locale: k.locale,
      created_at: k.created_at,
      app_id: k.app_id,
      ranks: desc.slice().reverse(),
      latest: desc[0] ?? null,
    };
  });

  return { ok: true, keywords: payload };
}
