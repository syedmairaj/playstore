import type { SupabaseClient } from "@supabase/supabase-js";

export type LatestAiListingKeywordsRow = {
  generationId: string;
  keywordSuggestions: string[];
  createdAt: string;
};

function extractSuggestions(outputJson: unknown): string[] {
  if (!outputJson || typeof outputJson !== "object") return [];
  const ks = (outputJson as { keywordSuggestions?: unknown }).keywordSuggestions;
  if (!Array.isArray(ks)) return [];
  return ks
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 30);
}

function suggestionsFromTargetKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 30);
}

/** Latest listing generation per app (where `app_id` is set), for Keyword Tracker AI suggestions. */
export async function loadLatestAiListingKeywordsByApp(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Record<string, LatestAiListingKeywordsRow>> {
  const { data, error } = await supabase
    .from("listing_generations")
    .select("id, app_id, output_json, target_keywords, created_at")
    .eq("workspace_id", workspaceId)
    .not("app_id", "is", null)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return {};

  const byApp = new Map<string, LatestAiListingKeywordsRow>();
  for (const row of data) {
    const aid = row.app_id as string | null;
    if (!aid || byApp.has(aid)) continue;
    const fromOutput = extractSuggestions(row.output_json);
    const fromTargets = suggestionsFromTargetKeywords(row.target_keywords);
    const suggestions =
      fromOutput.length > 0 ? fromOutput : fromTargets;
    if (suggestions.length === 0) continue;
    byApp.set(aid, {
      generationId: row.id as string,
      keywordSuggestions: suggestions.slice(0, 8),
      createdAt: row.created_at as string,
    });
  }

  return Object.fromEntries(byApp);
}
