import type { SupabaseClient } from "@supabase/supabase-js";
import { keywordMarketToPlayCountryCode } from "@/lib/keywords/rank-snapshot-market";

export type RankSnapshotLite = {
  rank: number | null;
  snapshot_at: string;
  country_code?: string | null;
};

export function primaryPlayCountryForKeyword(marketRaw: string): string {
  const raw = String(marketRaw ?? "").trim();
  return (keywordMarketToPlayCountryCode(raw) ?? raw.toLowerCase()) || "us";
}

/**
 * Latest headline rank for the keyword’s primary Play market, matching
 * `serper-refresh` / `serper-save` “primary row” semantics (newest snapshot where
 * `country_code` is null or equals the keyword market code).
 */
export function latestPrimaryMarketRankFromSnapshots(
  rows: RankSnapshotLite[],
  keywordMarket: string,
): number | null {
  const mkt = primaryPlayCountryForKeyword(keywordMarket);
  const sorted = [...rows].sort(
    (a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime(),
  );
  for (const r of sorted) {
    const ccRaw = r.country_code;
    const cc =
      ccRaw != null && String(ccRaw).trim() !== ""
        ? String(ccRaw).trim().toLowerCase()
        : "";
    if (cc !== "" && cc !== mkt) continue;
    const rk = r.rank;
    if (rk != null && Number.isFinite(rk)) return rk;
  }
  return null;
}

export async function fetchLatestPrimaryRanksForKeywords(
  supabase: SupabaseClient,
  keywords: { id: string; market: string }[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (const k of keywords) out.set(k.id, null);
  if (keywords.length === 0) return out;

  const ids = keywords.map((k) => k.id);
  const { data, error } = await supabase
    .from("keyword_rank_snapshots")
    .select("keyword_id,rank,snapshot_at,country_code")
    .in("keyword_id", ids);

  if (error) throw new Error(error.message);

  const byKid = new Map<string, RankSnapshotLite[]>();
  for (const r of data ?? []) {
    const kid = r.keyword_id as string;
    if (!byKid.has(kid)) byKid.set(kid, []);
    byKid.get(kid)!.push({
      rank: r.rank as number | null,
      snapshot_at: String(r.snapshot_at ?? ""),
      country_code: r.country_code as string | null | undefined,
    });
  }

  for (const k of keywords) {
    out.set(
      k.id,
      latestPrimaryMarketRankFromSnapshots(byKid.get(k.id) ?? [], k.market),
    );
  }
  return out;
}
