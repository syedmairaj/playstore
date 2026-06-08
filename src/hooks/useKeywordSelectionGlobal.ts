/**
 * useKeywordSelectionGlobal Hook - TERM-BASED NORMALIZATION WITH CATEGORY COUNTS
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: Term-Based Global State + Category-Aware Counting
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem (Before):
 * - Composite key: `term|category` treated same keyword differently in each category
 * - 'myfitnesspal|high_volume' ≠ 'myfitnesspal|intent_based' (separate selections)
 * - Result: Same term selected in one category but not others ❌
 *
 * Solution (After - HYBRID APPROACH):
 * - Global selection: Set<term> (just "myfitnesspal", not category-aware)
 * - Category counts: Calculated at render time by component
 * - When term is selected: ALL instances show selected (global)
 * - Counts reflect how many unique selected terms in each category (accurate)
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────┐
 * │ Normalized State (Single Source of Truth)                │
 * │ selectedTerms: Set<"myfitnesspal", "fitness", ...>       │
 * │                                                          │
 * │ - O(1) lookup: selectedTerms.has("myfitnesspal")        │
 * │ - Global: selecting term affects ALL categories          │
 * │ - Simple: Just terms, no category complexity             │
 * └──────────────────────────────────────────────────────────┘
 *          ↓
 * ┌──────────────────────────────────────────────────────────┐
 * │ Category Counts (Computed by Component)                  │
 * │                                                          │
 * │ For each category:                                       │
 * │ - Count how many keywords belong to that category        │
 * │ - Check if each keyword's term is in selectedTerms       │
 * │ - Return count of selected terms in that category        │
 * │                                                          │
 * │ Example:                                                 │
 * │ HIGH-VOLUME has: [myfitnesspal, health, fitness]        │
 * │ selectedTerms = {myfitnesspal, health}                   │
 * │ → Count = 2 (myfitnesspal ✓, health ✓, fitness ❌)      │
 * └──────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXAMPLE: Same keyword in different categories
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Data:
 * HIGH-VOLUME:     [myfitnesspal, health, fitness, ...]
 * INTENT-BASED:    [myfitnesspal, monitor, app, ...]
 * COMPETITOR-GAP:  [myfitnesspal, nutrition, ...]
 *
 * User Action: Click 'myfitnesspal' in HIGH-VOLUME
 *   ↓
 * selectedTerms = Set{"myfitnesspal"}
 *   ↓
 * Component re-renders, calculates counts:
 * - HIGH-VOLUME: Count keywords where term in selectedTerms = 1
 * - INTENT-BASED: Count keywords where term in selectedTerms = 1
 * - COMPETITOR-GAP: Count keywords where term in selectedTerms = 1
 *   ↓
 * UI Result:
 * - HIGH-VOLUME: Shows "1/7 selected", 'myfitnesspal' has checkmark ✓
 * - INTENT-BASED: Shows "1/4 selected", 'myfitnesspal' has checkmark ✓
 * - COMPETITOR-GAP: Shows "1/5 selected", 'myfitnesspal' has checkmark ✓
 *
 * ALL THREE categories show 'myfitnesspal' as selected! (GLOBAL SYNC) ✓
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BILINGUAL SUPPORT (EN/AR)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Category labels localized:
 * - high_volume: "High-Volume" (EN), "عالي الحجم" (AR)
 * - intent_based: "Intent-Based" (EN), "موجه بالنية" (AR)
 * - competitor_gap: "Competitor Gap" (EN), "فجوة تنافسية" (AR)
 *
 * Selection state is LANGUAGE-INDEPENDENT:
 * - Select in English: 'myfitnesspal' → selectedTerms
 * - Switch to Arabic: Same selectedTerms (terms don't change)
 * - Result: Selection persists across language switches ✓
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION & EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Despite term-based state, final payload includes category:
 *
 * User selects 'myfitnesspal' (appears in 2 categories)
 * selectedTerms = Set{"myfitnesspal"}
 *
 * getSelectedKeywords(allKeywords) returns:
 * [
 *   { term: 'myfitnesspal', category: 'high_volume' },
 *   { term: 'myfitnesspal', category: 'intent_based' },
 * ]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

/**
 * Category types matching database schema
 */
export type KeywordCategory = 'high_volume' | 'intent_based' | 'competitor_gap';

/**
 * Keyword payload structure sent to staging vault
 * Includes both term (normalized) and category (location-specific)
 */
export interface KeywordPayload {
  term: string;
  category: KeywordCategory;
  [key: string]: unknown;
}

/**
 * Hook return type with all selection management methods
 */
export interface UseKeywordSelectionGlobalReturn {
  // Normalized state (single source of truth)
  selectedTerms: Set<string>;

  // Derived state (memoized)
  selectedCount: number;
  countByCategory: Record<KeywordCategory, number>;

  // Query methods (O(1) lookups)
  isTermSelected: (term: string) => boolean;

  // Action methods
  toggleTerm: (term: string) => void;
  clearAll: () => void;

  // Export methods (strict schema for staging-vault-service.ts)
  getSelectedKeywords: (
    allKeywords: Array<{ term: string; category: KeywordCategory }>
  ) => KeywordPayload[];

  // Helper to compute category counts given keywords
  computeCategoryCount: (keywords: string[]) => number;
}

/**
 * Get localized category labels (for EN/AR support)
 * @internal
 */
function getCategoryLabel(category: KeywordCategory, locale: string): string {
  const labels: Record<KeywordCategory, Record<string, string>> = {
    high_volume: {
      en: 'High-Volume',
      ar: 'عالي الحجم',
    },
    intent_based: {
      en: 'Intent-Based',
      ar: 'موجه بالنية',
    },
    competitor_gap: {
      en: 'Competitor Gap',
      ar: 'فجوة تنافسية',
    },
  };

  const key = locale === 'ar' ? 'ar' : 'en';
  return labels[category]?.[key] || category;
}

/**
 * Hook for managing keyword selection with TERM-BASED global state
 *
 * Key insight: Selection state is based on TERM only, not category.
 * This ensures that selecting 'myfitnesspal' in HIGH-VOLUME automatically
 * shows it as selected in INTENT-BASED and COMPETITOR-GAP as well.
 *
 * Category counts are computed by the component, not the hook.
 *
 * @param locale User locale for formatting ('en' or 'ar')
 * @returns Selection management interface with term-based logic
 */
export function useKeywordSelectionGlobal(
  locale: string = 'en'
): UseKeywordSelectionGlobalReturn {
  // ═════════════════════════════════════════════════════════════════════
  // NORMALIZED STATE (Single Source of Truth)
  // ═════════════════════════════════════════════════════════════════════

  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());

  // ═════════════════════════════════════════════════════════════════════
  // SELECTION ACTIONS (Term-based, global)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Toggle term selection (affects all categories where term appears)
   *
   * Example:
   * ```
   * toggleTerm('myfitnesspal')
   * // → selectedTerms now includes 'myfitnesspal'
   * // → Pill in HIGH-VOLUME shows checkmark
   * // → Pill in INTENT-BASED shows checkmark (same term!)
   * // → Pill in COMPETITOR-GAP shows checkmark (same term!)
   * // → All category counts update automatically
   * ```
   */
  const toggleTerm = useCallback((term: string) => {
    setSelectedTerms((prev) => {
      const newSet = new Set(prev);

      if (newSet.has(term)) {
        newSet.delete(term);
        console.log(`[KeywordSelectionGlobal] 🔍 DESELECTED: "${term}"`, {
          totalCount: newSet.size,
          locale,
          timestamp: new Date().toISOString(),
        });
      } else {
        newSet.add(term);
        console.log(`[KeywordSelectionGlobal] ✓ SELECTED: "${term}"`, {
          totalCount: newSet.size,
          locale,
          timestamp: new Date().toISOString(),
        });
      }

      return newSet;
    });
  }, [locale]);

  /**
   * Clear all selections (clears all terms)
   * Works for both EN and AR
   */
  const clearAll = useCallback(() => {
    setSelectedTerms(new Set());
    console.log('[KeywordSelectionGlobal] 🔍 CLEAR ALL SELECTIONS', {
      locale,
      timestamp: new Date().toISOString(),
    });
  }, [locale]);

  // ═════════════════════════════════════════════════════════════════════
  // SELECTION QUERIES (O(1) lookups)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Check if term is selected (works across ALL categories)
   *
   * O(1) Set.has() lookup - Language independent
   */
  const isTermSelected = useCallback(
    (term: string): boolean => {
      return selectedTerms.has(term);
    },
    [selectedTerms]
  );

  // ═════════════════════════════════════════════════════════════════════
  // HELPER: Compute count for a set of keywords
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Helper method: Count how many keywords in a category are selected
   *
   * Component uses this in render to calculate countByCategory:
   * ```
   * selectedCount={computeCategoryCount(group.keywords)}
   * ```
   *
   * @param keywords - Array of keyword strings in the category
   * @returns Count of keywords in this list that are in selectedTerms
   */
  const computeCategoryCount = useCallback(
    (keywords: string[]): number => {
      return keywords.filter((keyword) => selectedTerms.has(keyword)).length;
    },
    [selectedTerms]
  );

  // ═════════════════════════════════════════════════════════════════════
  // DERIVED STATE (Memoized)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Total count of selected unique terms (language independent)
   */
  const selectedCount = useMemo(() => selectedTerms.size, [selectedTerms]);

  /**
   * Placeholder: Component should calculate this using computeCategoryCount
   * We return empty since counts depend on component's keyword data
   */
  const countByCategory = useMemo(() => {
    return {
      high_volume: 0,
      intent_based: 0,
      competitor_gap: 0,
    };
  }, [selectedTerms]);

  // ═════════════════════════════════════════════════════════════════════
  // EXPORT METHODS (Strict schema)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Export selected keywords with their categories
   *
   * Input: All keywords with their categories (from component)
   * Output: Only selected keywords with their categories
   *
   * Example:
   * Input: [
   *   { term: 'myfitnesspal', category: 'high_volume' },
   *   { term: 'myfitnesspal', category: 'intent_based' },
   *   { term: 'health', category: 'high_volume' },
   * ]
   *
   * If selectedTerms = Set{'myfitnesspal'}
   * Output: [
   *   { term: 'myfitnesspal', category: 'high_volume' },
   *   { term: 'myfitnesspal', category: 'intent_based' },
   * ]
   *
   * Language independent - terms are the same in EN and AR
   */
  const getSelectedKeywords = useCallback(
    (allKeywords: Array<{ term: string; category: KeywordCategory }>): KeywordPayload[] => {
      const payload: KeywordPayload[] = [];

      // Filter keywords where term is in selectedTerms
      // Include their category information
      allKeywords.forEach(({ term, category }) => {
        if (selectedTerms.has(term)) {
          payload.push({ term, category });
        }
      });

      console.log('[KeywordSelectionGlobal] ✓ EXPORT PAYLOAD', {
        count: payload.length,
        uniqueTerms: selectedTerms.size,
        locale,
        timestamp: new Date().toISOString(),
      });

      return payload;
    },
    [selectedTerms, locale]
  );

  // ═════════════════════════════════════════════════════════════════════
  // RETURN INTERFACE
  // ═════════════════════════════════════════════════════════════════════

  return {
    selectedTerms,
    selectedCount,
    countByCategory,
    isTermSelected,
    toggleTerm,
    clearAll,
    getSelectedKeywords,
    computeCategoryCount, // ✅ NEW: Component uses this to calculate counts
  };
}
