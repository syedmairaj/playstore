import type { SupabaseClient } from "@supabase/supabase-js";
import {
  discoveryContextMatchesWorkspaceApp,
  looksLikeGeneratedKeywordBlob,
} from "@/lib/client/app-discovery-context";
import {
  filterAiListingKeywordsForApp,
  isAiListingPackTrustedForApp,
  joinKeywordsForRestoreCheck,
} from "@/lib/keywords/discovery-app-relevance";
import { INSTANT_DRAFT_PROMPT_VERSION } from "@/lib/listing/listing-export-unlock";

export type LatestAiListingKeywordsRow = {
  generationId: string;
  keywordSuggestions: string[];
  createdAt: string;
};

export type LatestAiListingAppContext = {
  id: string;
  name: string;
  category?: string | null;
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

function categoriesConflict(
  savedCategory: string,
  workspaceCategory: string,
): boolean {
  const a = savedCategory.trim().toLowerCase();
  const b = workspaceCategory.trim().toLowerCase();
  if (!a || !b) return false;
  return a !== b;
}

/**
 * Resolve trusted AI discovery keywords for one listing_generations row + workspace app.
 * Enforces ASO multi-app isolation: never surface another app's vertical under the selected app.
 */
export function resolveTrustedAiListingKeywordsForApp(
  row: {
    output_json: unknown;
    target_keywords: unknown;
    app_name?: unknown;
    category?: unknown;
    prompt_version?: unknown;
  },
  app: LatestAiListingAppContext,
): string[] | null {
  const savedAppName =
    typeof row.app_name === "string" ? row.app_name : "";
  const savedCategory =
    typeof row.category === "string" ? row.category : "";
  const promptVersion =
    typeof row.prompt_version === "string" ? row.prompt_version : null;

  if (promptVersion?.trim() === INSTANT_DRAFT_PROMPT_VERSION) {
    return null;
  }

  if (
    !discoveryContextMatchesWorkspaceApp(savedAppName, app.name)
  ) {
    return null;
  }

  if (categoriesConflict(savedCategory, app.category ?? "")) {
    return null;
  }

  const fromOutput = extractSuggestions(row.output_json);
  const fromTargets = suggestionsFromTargetKeywords(row.target_keywords);

  // Prefer model keywordSuggestions. Fall back to target_keywords only when they
  // look like user Market Discovery input (not AI-tagged blobs).
  let candidates = fromOutput;
  if (candidates.length === 0 && fromTargets.length > 0) {
    const targetText = joinKeywordsForRestoreCheck(fromTargets);
    if (looksLikeGeneratedKeywordBlob(targetText)) {
      return null;
    }
    candidates = fromTargets;
  }

  if (candidates.length === 0) return null;

  const appCtx = { appName: app.name, category: app.category };
  if (!isAiListingPackTrustedForApp(candidates, appCtx)) {
    return null;
  }

  return filterAiListingKeywordsForApp(candidates, appCtx).slice(0, 8);
}

/**
 * Latest listing generation per app (where `app_id` is set), for Keyword Tracker AI suggestions.
 * Skips instant-draft rows and cross-app / wrong-vertical keyword packs (ASO multi-app isolation).
 * Walks newer→older rows so a polluted latest row does not block an older valid generation.
 */
export async function loadLatestAiListingKeywordsByApp(
  supabase: SupabaseClient,
  workspaceId: string,
  apps: LatestAiListingAppContext[] = [],
): Promise<Record<string, LatestAiListingKeywordsRow>> {
  const { data, error } = await supabase
    .from("listing_generations")
    .select(
      "id, app_id, app_name, category, output_json, target_keywords, prompt_version, created_at",
    )
    .eq("workspace_id", workspaceId)
    .not("app_id", "is", null)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return {};

  const appById = new Map(apps.map((a) => [a.id, a]));
  const byApp = new Map<string, LatestAiListingKeywordsRow>();
  /** Apps that already found a trusted pack — skip further rows. */
  const resolved = new Set<string>();

  for (const row of data) {
    const aid = row.app_id as string | null;
    if (!aid || resolved.has(aid)) continue;

    const app = appById.get(aid) ?? {
      id: aid,
      name:
        typeof row.app_name === "string" && row.app_name.trim()
          ? row.app_name.trim()
          : "",
      category:
        typeof row.category === "string" ? row.category : null,
    };

    if (!app.name.trim()) continue;

    const suggestions = resolveTrustedAiListingKeywordsForApp(row, app);
    if (!suggestions?.length) continue;

    resolved.add(aid);
    byApp.set(aid, {
      generationId: row.id as string,
      keywordSuggestions: suggestions,
      createdAt: row.created_at as string,
    });
  }

  return Object.fromEntries(byApp);
}
