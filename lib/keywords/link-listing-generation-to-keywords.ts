import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLatestPrimaryRanksForKeywords } from "@/lib/keywords/primary-market-latest-rank";

/**
 * After a successful full AI listing generation for an app, link the generation
 * to every tracked keyword for that app and snapshot headline ranks for ROI math.
 */
export async function linkListingGenerationToTrackedKeywords(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  appId: string;
  listingGenerationId: string;
}): Promise<void> {
  const { supabase, workspaceId, appId, listingGenerationId } = params;

  const { data: kws, error: kwErr } = await supabase
    .from("keywords")
    .select("id,market")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId);

  if (kwErr || !kws?.length) return;

  const list = kws as { id: string; market: string }[];
  let rankById: Map<string, number | null>;
  try {
    rankById = await fetchLatestPrimaryRanksForKeywords(supabase, list);
  } catch {
    rankById = new Map(list.map((k) => [k.id, null]));
  }

  const nowIso = new Date().toISOString();
  const linkRows = list.map((k) => ({
    listing_generation_id: listingGenerationId,
    keyword_id: k.id,
    workspace_id: workspaceId,
  }));

  const { error: linkErr } = await supabase.from("listing_generation_keywords").insert(linkRows);
  if (linkErr) {
    const dup = linkErr.code === "23505" || /duplicate key/i.test(linkErr.message ?? "");
    if (!dup) {
      console.error("[link-listing-generation-to-keywords] insert_links", linkErr.message);
      return;
    }
  }

  await Promise.all(
    list.map((k) =>
      supabase
        .from("keywords")
        .update({
          last_listing_optimization_at: nowIso,
          last_listing_optimization_generation_id: listingGenerationId,
          rank_at_last_listing_optimization: rankById.get(k.id) ?? null,
        })
        .eq("id", k.id)
        .eq("workspace_id", workspaceId),
    ),
  );
}
