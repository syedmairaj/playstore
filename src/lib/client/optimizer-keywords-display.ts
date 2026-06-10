/**
 * Optimizer Keywords Display Utilities
 *
 * Handles display, grouping, and management of staged keywords in the Active Context.
 * Provides category grouping, keyword extraction, and UI-friendly formatting.
 *
 * Features:
 * - Extract keywords from staging vault signals
 * - Group by category (High-Volume, Intent-Based, Competitor Gap)
 * - Bilingual support (EN/AR)
 * - Track removal state
 * - Type-safe keyword payloads
 */

import type { KeywordPayload } from "@/hooks/useKeywordSelection";

/**
 * Category type matching keyword payloads
 */
export type KeywordCategory = "high_volume" | "intent_based" | "competitor_gap";

/**
 * Keyword display item with metadata
 */
export interface KeywordDisplayItem {
  id: string;
  term: string;
  category: KeywordCategory;
  source: "staging_vault" | "backlog";
  originalId: string; // ID from staging vault for removal
}

/**
 * Grouped keywords by category
 */
export type GroupedKeywords = {
  [K in KeywordCategory]?: KeywordDisplayItem[];
};

/**
 * Get localized category labels
 */
export function getCategoryLabel(category: KeywordCategory, locale: string): string {
  const labels = locale === "ar"
    ? {
        high_volume: "عالي الحجم",
        intent_based: "موجه بالنية",
        competitor_gap: "فجوة تنافسية",
      }
    : {
        high_volume: "High-Volume",
        intent_based: "Intent-Based",
        competitor_gap: "Competitor Gap",
      };
  return labels[category];
}

/**
 * Extract keywords from optimizer context active items
 *
 * @param activeItems - Items from optimizerContext?.activeItems
 * @returns Array of keyword display items
 */
export function extractKeywordsFromContext(
  activeItems: Array<{
    id: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }> | undefined
): KeywordDisplayItem[] {
  if (!activeItems || activeItems.length === 0) {
    console.log("[extractKeywordsFromContext] No activeItems provided");
    return [];
  }

  console.log("[extractKeywordsFromContext] Processing activeItems:", {
    count: activeItems.length,
    items: activeItems.map(item => ({
      id: item.id,
      hasMetadata: !!item.metadata,
      hasKeywords: Array.isArray((item.metadata as any)?.keywords),
      keywordCount: Array.isArray((item.metadata as any)?.keywords) ? (item.metadata as any).keywords.length : 0,
    })),
  });

  const keywords: KeywordDisplayItem[] = [];

  for (const item of activeItems) {
    // Try to extract keywords from metadata
    const metadata = item.metadata as Record<string, unknown> | undefined;
    if (metadata?.keywords && Array.isArray(metadata.keywords)) {
      const keywordsArray = metadata.keywords as unknown[];
      console.log("[extractKeywordsFromContext] Found keywords array:", {
        signalId: item.id,
        keywordCount: keywordsArray.length,
        firstKeyword: keywordsArray[0],
        firstKeywordType: typeof keywordsArray[0],
      });

      for (const kw of keywordsArray) {
        // Handle both object format { term, category } and string format (legacy)
        if (typeof kw === "string") {
          // Legacy format: just a string keyword
          // Infer category based on position (same logic as original grouping)
          const index = keywordsArray.indexOf(kw);
          const inferredCategory = index < Math.ceil(keywordsArray.length / 3)
            ? "high_volume"
            : index < Math.ceil((keywordsArray.length * 2) / 3)
            ? "intent_based"
            : "competitor_gap";

          keywords.push({
            id: `${item.id}-${kw}`,
            term: kw,
            category: inferredCategory as KeywordCategory,
            source: "staging_vault",
            originalId: item.id,
          });
        } else {
          // New format: { term, category } object
          const keyword = kw as Record<string, unknown>;
          if (
            keyword.term &&
            typeof keyword.term === "string" &&
            keyword.category &&
            typeof keyword.category === "string"
          ) {
            keywords.push({
              id: `${item.id}-${keyword.term}`,
              term: keyword.term,
              category: keyword.category as KeywordCategory,
              source: "staging_vault",
              originalId: item.id,
            });
          }
        }
      }
    } else {
      console.log("[extractKeywordsFromContext] No keywords found in metadata:", {
        signalId: item.id,
        metadataKeys: metadata ? Object.keys(metadata) : 'no metadata',
      });
    }
  }

  console.log("[extractKeywordsFromContext] ✅ Extracted total keywords:", keywords.length);
  return keywords;
}

/**
 * Group keywords by category
 *
 * @param keywords - Array of keyword display items
 * @returns Keywords grouped by category
 */
export function groupKeywordsByCategory(
  keywords: KeywordDisplayItem[]
): GroupedKeywords {
  const grouped: GroupedKeywords = {};

  for (const keyword of keywords) {
    if (!grouped[keyword.category]) {
      grouped[keyword.category] = [];
    }
    grouped[keyword.category]!.push(keyword);
  }

  return grouped;
}

/**
 * Get category order for consistent display
 */
export const KEYWORD_CATEGORY_ORDER: KeywordCategory[] = [
  "high_volume",
  "intent_based",
  "competitor_gap",
];

/**
 * Get icon for category (for use in UI)
 */
export function getCategoryIcon(category: KeywordCategory): string {
  const icons: Record<KeywordCategory, string> = {
    high_volume: "📊",
    intent_based: "🎯",
    competitor_gap: "🔓",
  };
  return icons[category];
}

/**
 * Get color class for category
 */
export function getCategoryColorClasses(
  category: KeywordCategory
): {
  text: string;
  bg: string;
  border: string;
  hoverBg: string;
  removeBg: string;
} {
  const colors: Record<
    KeywordCategory,
    {
      text: string;
      bg: string;
      border: string;
      hoverBg: string;
      removeBg: string;
    }
  > = {
    high_volume: {
      text: "text-sky-200/90",
      bg: "bg-sky-500/10",
      border: "border-sky-500/25",
      hoverBg: "hover:bg-sky-500/20",
      removeBg: "text-sky-400/50 hover:bg-sky-500/20 hover:text-sky-300",
    },
    intent_based: {
      text: "text-purple-200/90",
      bg: "bg-purple-500/10",
      border: "border-purple-500/25",
      hoverBg: "hover:bg-purple-500/20",
      removeBg: "text-purple-400/50 hover:bg-purple-500/20 hover:text-purple-300",
    },
    competitor_gap: {
      text: "text-orange-200/90",
      bg: "bg-orange-500/10",
      border: "border-orange-500/25",
      hoverBg: "hover:bg-orange-500/20",
      removeBg: "text-orange-400/50 hover:bg-orange-500/20 hover:text-orange-300",
    },
  };
  return colors[category];
}

/**
 * Check if category has keywords
 */
export function hasCategoryKeywords(
  grouped: GroupedKeywords,
  category: KeywordCategory
): boolean {
  return grouped[category] ? grouped[category]!.length > 0 : false;
}

/**
 * Get total keyword count
 */
export function getTotalKeywordCount(keywords: KeywordDisplayItem[]): number {
  return keywords.length;
}

/**
 * Deduplicate keywords by term and category
 */
export function deduplicateKeywords(
  keywords: KeywordDisplayItem[]
): KeywordDisplayItem[] {
  const seen = new Set<string>();
  return keywords.filter((kw) => {
    const key = `${kw.term}|${kw.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
