import type { SupabaseClient } from "@supabase/supabase-js";
import { demoRankRowsForInsert } from "@/lib/keywords/demo-rank-snapshots";

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

type LoadOpts = {
  /** When set, only keywords for this app are returned. */
  appId?: string | null;
  /** Insert deterministic demo snapshots when a keyword has no rows (tests only; default false). */
  ensureDemoSnapshots?: boolean;
};

async function fetchRanksGrouped(
  supabase: SupabaseClient,
  keywordIds: string[],
): Promise<Record<string, { rank: number | null; captured_at: string }[]>> {
  const ranksByKeyword: Record<string, { rank: number | null; captured_at: string }[]> = {};
  if (keywordIds.length === 0) return ranksByKeyword;

  const { data: rankRows, error } = await supabase
    .from("keyword_rank_snapshots")
    .select("keyword_id,rank,snapshot_at")
    .in("keyword_id", keywordIds);

  if (error) {
    throw new Error(error.message);
  }

  const sorted = [...(rankRows ?? [])].sort((a, b) => {
    const ka = a.keyword_id as string;
    const kb = b.keyword_id as string;
    if (ka !== kb) return ka.localeCompare(kb);
    return (
      new Date(b.snapshot_at as string).getTime() -
      new Date(a.snapshot_at as string).getTime()
    );
  });

  for (const r of sorted) {
    const kid = r.keyword_id as string;
    if (!ranksByKeyword[kid]) ranksByKeyword[kid] = [];
    if (ranksByKeyword[kid].length < 40) {
      ranksByKeyword[kid].push({
        rank: r.rank as number | null,
        captured_at: r.snapshot_at as string,
      });
    }
  }

  return ranksByKeyword;
}

export async function loadWorkspaceKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: LoadOpts,
): Promise<{ ok: true; keywords: KeywordWithRanks[] } | { ok: false; message: string }> {
  const ensureDemo = options?.ensureDemoSnapshots === true;

  let q = supabase
    .from("keywords")
    .select("id,term,market,locale,created_at,app_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (options?.appId) {
    q = q.eq("app_id", options.appId);
  }

  const { data: keywords, error } = await q;

  if (error) {
    return { ok: false, message: error.message };
  }

  const list = keywords ?? [];
  const ids = list.map((k) => k.id);

  try {
    let ranksByKeyword = await fetchRanksGrouped(supabase, ids);

    if (ensureDemo) {
      const missing = list.filter((k) => (ranksByKeyword[k.id]?.length ?? 0) === 0);
      if (missing.length > 0) {
        const rows = missing.flatMap((k) => demoRankRowsForInsert(k.id, k.term));
        const { error: insErr } = await supabase
          .from("keyword_rank_snapshots")
          .insert(rows);
        if (insErr) {
          return { ok: false, message: insErr.message };
        }
        ranksByKeyword = await fetchRanksGrouped(supabase, ids);
      }
    }

    const payload: KeywordWithRanks[] = list.map((k) => {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, message: msg };
  }
}
