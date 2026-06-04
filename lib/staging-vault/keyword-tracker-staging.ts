/**
 * Keyword Tracker → Staging Vault Integration
 *
 * Stage keywords from Keyword Tracker into persistent vault.
 * Maintains exact language context (English/Arabic) and rank metadata.
 *
 * Features:
 * - Multi-country keyword staging (countryCode metadata)
 * - Current rank tracking (for competitive benchmarking)
 * - Search volume preservation
 * - Full RTL/LTR localization support
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { addSignalToVault } from "./staging-vault-service";

/**
 * Keyword from Keyword Tracker module
 */
export interface TrackedKeyword {
  id: string;
  keyword: string;
  countryCode: string; // 'US', 'SA', 'AE', etc
  currentRank: number;
  previousRank?: number;
  searchVolume?: number;
  difficulty?: number;
  language: string; // 'en', 'ar', 'fr', etc
  locale: string; // 'en-US', 'ar-SA', etc (for region-specific)
  trend?: "up" | "down" | "stable";
  lastUpdated: string;
}

/**
 * Stage a single keyword from Keyword Tracker
 *
 * Automatically detects language and RTL based on locale.
 * Preserves all metadata for Brand Mirror Engine to use.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param appId - Target app
 * @param keyword - Tracked keyword data
 */
export async function stageKeywordFromTracker(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  keyword: TrackedKeyword
): Promise<{
  id: string;
  message: string;
}> {
  try {
    // Extract language from locale (e.g., 'en-US' → 'en', 'ar-SA' → 'ar')
    const language = keyword.language || keyword.locale.split("-")[0];

    // Detect RTL based on language code
    const isRtl = ["ar", "he", "fa", "ur"].includes(language);

    const result = await addSignalToVault(supabase, workspaceId, {
      signalType: "keyword",
      content: keyword.keyword,
      source: "keyword_tracker",
      sourceAppId: appId,
      sourceContext: "keyword_tracker",
      sourceContextId: keyword.id,
      language,
      metadata: {
        countryCode: keyword.countryCode,
        currentRank: keyword.currentRank,
        previousRank: keyword.previousRank,
        searchVolume: keyword.searchVolume,
        difficulty: keyword.difficulty,
        trend: keyword.trend,
        locale: keyword.locale,
        lastUpdated: keyword.lastUpdated,
        // RTL indicators for downstream consumption
        isRtl,
        directionality: isRtl ? "rtl" : "ltr",
      },
    });

    return {
      id: result.id,
      message: `Staged keyword "${keyword.keyword}" (${keyword.countryCode}, Rank: ${keyword.currentRank})`,
    };
  } catch (err) {
    console.error("[KeywordTrackerStaging] Failed:", err);
    throw err;
  }
}

/**
 * Stage multiple keywords at once (bulk)
 *
 * Useful for: staging all keywords for an app, or top N keywords by rank.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param appId - Target app
 * @param keywords - Array of tracked keywords
 * @returns Count of successfully staged keywords
 */
export async function stageMultipleKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  keywords: TrackedKeyword[]
): Promise<{
  staged: number;
  failed: number;
  errors: Array<{ keyword: string; error: string }>;
}> {
  const results = {
    staged: 0,
    failed: 0,
    errors: [] as Array<{ keyword: string; error: string }>,
  };

  for (const keyword of keywords) {
    try {
      await stageKeywordFromTracker(supabase, workspaceId, appId, keyword);
      results.staged++;
    } catch (err) {
      results.failed++;
      results.errors.push({
        keyword: keyword.keyword,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Stage top N keywords by search volume
 *
 * Helper for "Stage Top 10 Keywords" button.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param appId - Target app
 * @param keywords - Array of tracked keywords (unsorted)
 * @param count - Number of top keywords to stage (default 10)
 */
export async function stageTopKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  keywords: TrackedKeyword[],
  count: number = 10
): Promise<{
  staged: number;
  message: string;
}> {
  // Sort by search volume (descending), then by rank (ascending)
  const sorted = [...keywords].sort((a, b) => {
    const volumeDiff = (b.searchVolume || 0) - (a.searchVolume || 0);
    if (volumeDiff !== 0) return volumeDiff;
    return a.currentRank - b.currentRank;
  });

  const topN = sorted.slice(0, count);
  const results = await stageMultipleKeywords(supabase, workspaceId, appId, topN);

  return {
    staged: results.staged,
    message: `Staged top ${results.staged} keywords for ${appId}`,
  };
}

/**
 * Stage keywords for a specific country
 *
 * Helper for "Stage All US Keywords" type buttons.
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param appId - Target app
 * @param keywords - Array of tracked keywords
 * @param countryCode - Country to filter by ('US', 'SA', 'AE', etc)
 */
export async function stageKeywordsByCountry(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  keywords: TrackedKeyword[],
  countryCode: string
): Promise<{
  staged: number;
  message: string;
}> {
  const filtered = keywords.filter((k) => k.countryCode === countryCode);
  const results = await stageMultipleKeywords(supabase, workspaceId, appId, filtered);

  return {
    staged: results.staged,
    message: `Staged ${results.staged} keywords for ${countryCode}`,
  };
}

/**
 * Get localization context for a keyword
 *
 * Used by Brand Mirror Engine to determine which language/RTL rules to apply.
 *
 * @param keyword - Tracked keyword
 * @returns Localization metadata
 */
export function getKeywordLocalizationContext(keyword: TrackedKeyword): {
  language: string;
  locale: string;
  isRtl: boolean;
  directionality: "ltr" | "rtl";
  countryCode: string;
} {
  const language = keyword.language || keyword.locale.split("-")[0];
  const isRtl = ["ar", "he", "fa", "ur"].includes(language);

  return {
    language,
    locale: keyword.locale,
    isRtl,
    directionality: isRtl ? "rtl" : "ltr",
    countryCode: keyword.countryCode,
  };
}
