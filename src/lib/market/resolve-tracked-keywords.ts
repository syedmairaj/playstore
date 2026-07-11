import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadWorkspaceKeywords,
  type KeywordWithRanks,
} from "@/lib/keywords/load-workspace-keywords";

export type ResolveTrackedKeywordsResult =
  | { ok: true; keywords: KeywordWithRanks[]; scope: "app" | "workspace" }
  | { ok: false; message: string };

/**
 * Resolves tracked keywords for Wins Dashboard / rank-wins using the same
 * `keywords` table + rank hydration as Keyword Tracker (`loadWorkspaceKeywords`).
 *
 * 1. Prefer keywords for the active app plus workspace-wide rows (`app_id` IS NULL).
 * 2. Fall back to all workspace keywords when the app-scoped query is empty
 *    (Keyword Tracker lists workspace-wide without an app filter).
 */
export async function resolveTrackedKeywordsForWins(
  supabase: SupabaseClient,
  workspaceId: string,
  appId?: string | null,
): Promise<ResolveTrackedKeywordsResult> {
  if (appId) {
    const scoped = await loadWorkspaceKeywords(supabase, workspaceId, {
      appId,
      includeWorkspaceWideKeywords: true,
    });
    if (!scoped.ok) {
      return { ok: false, message: scoped.message };
    }
    if (scoped.keywords.length > 0) {
      return { ok: true, keywords: scoped.keywords, scope: "app" };
    }
  }

  const workspace = await loadWorkspaceKeywords(supabase, workspaceId);
  if (!workspace.ok) {
    return { ok: false, message: workspace.message };
  }
  return { ok: true, keywords: workspace.keywords, scope: "workspace" };
}

export function keywordRowsFromLoaded(loaded: KeywordWithRanks[]) {
  return loaded.map((k) => ({
    id: k.id,
    term: k.term,
    market: k.market,
    app_id: k.app_id,
    rank_at_last_listing_optimization: k.rankAtLastListingOptimization ?? null,
  }));
}
