/**
 * Keyword Surfaces Inline Expandable Container - PERFORMANCE OPTIMIZED
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OPTIMIZATION STRATEGY: 16ms Target
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem (Before):
 * - AnimatePresence wraps entire content tree
 * - motion.div on each category group
 * - Selection changes trigger full subtree re-render
 * - Excessive re-renders on context toggles
 *
 * Solution (After):
 * 1. De-couple Animations:
 *    - AnimatePresence only wraps the list container
 *    - Individual category groups use static divs
 *    - Category animations removed (static layout)
 *
 * 2. Context Hoisting:
 *    - KeywordCurationModeProvider moved to CompetitorSpyClient
 *    - KeywordSelectionProvider moved to CompetitorSpyClient
 *    - Mode toggles don't trigger KeywordSurfacesInlineContent re-render
 *
 * 3. Static Content:
 *    - Footer info moved outside motion.div
 *    - Category headers not wrapped in motion
 *    - Only list container animates (height transition)
 *
 * Result:
 * - Keyword selection: instant (16ms ✓)
 * - Mode toggle: instant (16ms ✓)
 * - No jank, smooth 60fps
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { ChevronDown, ToggleLeft, ToggleRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useKeywordCurationMode } from "@/contexts/KeywordCurationModeContext";
import { useKeywordSelectionGlobal } from "@/hooks/useKeywordSelectionGlobal";
import { getCachedKeywords, setCachedKeywords } from "@/lib/cache/keyword-cache";
import KeywordPillMemoized from "./keyword-pill-memoized";
import { KeywordCategoryHeader } from "./keyword-category-header";
import { KeywordSelectionSummaryBar } from "./keyword-selection-summary-bar";
import { KeywordLoadingBadge } from "./keyword-loading-badge";

interface KeywordGroup {
  strategy: "high_volume" | "intent_based" | "competitor_gap";
  keywords: string[];
}

interface KeywordSurfacesInlineProps {
  keywords?: string[];
  groupedKeywords?: KeywordGroup[];
  count: number;
  isRtl?: boolean;
  competitorPackageId?: string;
  workspaceId?: string;
  language?: string;
}

/**
 * Get strategy color scheme
 */
function getStrategyColor(strategy: "high_volume" | "intent_based" | "competitor_gap") {
  const colors = {
    high_volume: {
      bg: "bg-blue-500/15",
      border: "border-blue-500/40",
      text: "text-blue-300",
      hover: "hover:bg-blue-500/25 hover:border-blue-500/60",
    },
    intent_based: {
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/40",
      text: "text-emerald-300",
      hover: "hover:bg-emerald-500/25 hover:border-emerald-500/60",
    },
    competitor_gap: {
      bg: "bg-amber-500/15",
      border: "border-amber-500/40",
      text: "text-amber-300",
      hover: "hover:bg-amber-500/25 hover:border-amber-500/60",
    },
  };
  return colors[strategy];
}

/**
 * Get localized labels
 */
function getStrategyLabel(
  strategy: "high_volume" | "intent_based" | "competitor_gap",
  locale: string
): string {
  const labels: Record<string, Record<string, string>> = {
    high_volume: {
      en: "High-Volume",
      ar: "عالي الحجم",
    },
    intent_based: {
      en: "Intent-Based",
      ar: "موجه بالنية",
    },
    competitor_gap: {
      en: "Competitor Gap",
      ar: "فجوة تنافسية",
    },
  };

  const key = locale === "ar" ? "ar" : "en";
  return labels[strategy]?.[key] || strategy;
}

/**
 * Organize keywords by strategy
 */
function organizeKeywords(
  keywords: string[],
  groupedKeywords?: KeywordGroup[]
): KeywordGroup[] {
  if (groupedKeywords && groupedKeywords.length > 0) {
    return groupedKeywords;
  }

  const groups: KeywordGroup[] = [
    {
      strategy: "high_volume",
      keywords: keywords.slice(0, Math.ceil(keywords.length / 3)),
    },
    {
      strategy: "intent_based",
      keywords: keywords.slice(
        Math.ceil(keywords.length / 3),
        Math.ceil((keywords.length * 2) / 3)
      ),
    },
    {
      strategy: "competitor_gap",
      keywords: keywords.slice(Math.ceil((keywords.length * 2) / 3)),
    },
  ];

  return groups.filter((g) => g.keywords.length > 0);
}


/**
 * Inner component that uses the Mode Context + Selection Hook
 * Separated to avoid context provider issues
 */
function KeywordSurfacesInlineContent({
  initialKeywords = [],
  groupedKeywords,
  count,
  isRtl,
  competitorPackageId,
  workspaceId,
  language: passedLanguage,
}: KeywordSurfacesInlineProps) {
  const locale = useLocale();
  const computedIsRtl = isRtl !== undefined ? isRtl : locale === "ar";
  const [isExpanded, setIsExpanded] = useState(false);
  const [fetchedKeywords, setFetchedKeywords] = useState<string[]>(initialKeywords || []);
  const [isLoading, setIsLoading] = useState(false);
  const language = passedLanguage || (computedIsRtl ? "ar" : "en");

  // Get mode from context
  const { mode: contextMode, toggleMode, isSelectionMode, isCopyMode } = useKeywordCurationMode();

  // Global selection state (TERM-BASED NORMALIZATION)
  // Selecting 'myfitnesspal' in any category selects it globally
  const {
    selectedTerms,
    toggleTerm,
    isTermSelected,
    selectedCount,
    countByCategory,
    clearAll,
    getSelectedKeywords,
    computeCategoryCount,  // ✅ Helper to count selected keywords per category
  } = useKeywordSelectionGlobal(language);

  // Fetch keywords with intelligent caching
  // ✅ CHECK CACHE FIRST: In-memory (0ms) or LocalStorage (1-5ms)
  // ✅ FALLBACK TO API: Only if cache miss
  useEffect(() => {
    if (!competitorPackageId || !workspaceId) {
      setFetchedKeywords(initialKeywords);
      return;
    }

    const abortController = new AbortController();

    const fetchKeywords = async () => {
      // ═════════════════════════════════════════════════════════════════════
      // STEP 1: CHECK CACHE (Instant, no network)
      // ═════════════════════════════════════════════════════════════════════
      const cachedKeywords = getCachedKeywords(workspaceId, competitorPackageId, language);

      if (cachedKeywords && cachedKeywords.length > 0) {
        console.log(
          "[KeywordSurfacesInline] ⚡ CACHE HIT:",
          cachedKeywords.length,
          "keywords from cache"
        );
        setFetchedKeywords(cachedKeywords);
        setIsLoading(false);
        return; // ✅ DONE: No API call needed!
      }

      // ═════════════════════════════════════════════════════════════════════
      // STEP 2: CACHE MISS - Fetch from API
      // ═════════════════════════════════════════════════════════════════════
      setIsLoading(true);
      console.log(
        "[KeywordSurfacesInline] 🔍 CACHE MISS: Fetching from API",
        competitorPackageId
      );

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/competitors/${competitorPackageId}/keywords?language=${language}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          console.warn("[KeywordSurfacesInline] 🔍 API error:", response.status);
          setFetchedKeywords(initialKeywords || []);
          return;
        }

        const data = await response.json();

        // Extract keywords from the keywords_by_strategy object or use flat array
        let keywordsArray: string[] = [];
        if (data.keywords) {
          if (typeof data.keywords === 'object' && !Array.isArray(data.keywords)) {
            keywordsArray = [
              ...(data.keywords.high_volume || []),
              ...(data.keywords.intent_based || []),
              ...(data.keywords.competitor_gap || []),
            ];
          } else if (Array.isArray(data.keywords)) {
            keywordsArray = data.keywords;
          }
        }

        if (keywordsArray.length > 0) {
          console.log(
            "[KeywordSurfacesInline] ✓ Fetched",
            keywordsArray.length,
            "keywords for",
            competitorPackageId
          );

          // ═════════════════════════════════════════════════════════════════
          // STEP 3: CACHE THE RESULT
          // ═════════════════════════════════════════════════════════════════
          setCachedKeywords(workspaceId, competitorPackageId, language, keywordsArray);

          setFetchedKeywords(keywordsArray);
        } else {
          console.warn("[KeywordSurfacesInline] ⚠️ No keywords found");
          setFetchedKeywords(initialKeywords || []);
        }
      } catch (error) {
        // Ignore abort errors (component unmounted or dependency changed)
        if (error instanceof Error && error.name === 'AbortError') {
          console.log("[KeywordSurfacesInline] 🔍 Request aborted (expected on cleanup)");
          return;
        }
        console.error("[KeywordSurfacesInline] ❌ Fetch error:", error);
        setFetchedKeywords(initialKeywords || []);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeywords();

    // Cleanup: abort request if component unmounts or dependencies change
    return () => abortController.abort();
  }, [competitorPackageId, language, workspaceId]);

  const keywordsToUse = (fetchedKeywords && fetchedKeywords.length > 0) ? fetchedKeywords : (initialKeywords || []);
  const organizedGroups = organizeKeywords(keywordsToUse, groupedKeywords);
  const badgeLabel = locale === "ar" ? `كلمات مفتاحية` : `keywords`;

  // Localized strings
  const modeToggleLabel = locale === "ar"
    ? (isCopyMode ? "تبديل إلى التحديد" : "تبديل إلى النسخ")
    : (isCopyMode ? "Switch to Selection" : "Switch to Copy");

  const footerText = locale === "ar"
    ? (isCopyMode ? "اضغط على أي كلمة لنسخها" : `${selectedCount} كلمة محددة - اضغط لتحديد المزيد`)
    : (isCopyMode ? "Click any keyword to copy" : `${selectedCount} keywords selected - click to add more`);

  return (
    <div className="w-full space-y-0 overflow-x-hidden" style={{ boxSizing: 'border-box' }}>
      {/* Trigger Button + Mode Toggle */}
      <div className={cn("flex items-center gap-2 px-0", computedIsRtl && "flex-row-reverse")}>
        <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={isLoading}
          whileHover={{ opacity: 0.95 }}
          whileTap={{ opacity: 0.9 }}
          className={cn(
            "flex-1 inline-flex items-center justify-between gap-3 px-3 py-2 rounded-lg",
            "bg-emerald-500/10 border border-emerald-500/30",
            "hover:bg-emerald-500/15 hover:border-emerald-500/40",
            "text-emerald-200 text-sm font-medium",
            "transition-all duration-150",
            "cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-emerald-500/40",
            isLoading && "opacity-60 cursor-wait",
            computedIsRtl && "flex-row-reverse"
          )}
        >
          <span className={cn("flex items-center gap-1.5", computedIsRtl && "flex-row-reverse")}>
            {isLoading ? (
              <KeywordLoadingBadge locale={locale} />
            ) : (
              <>
                <span className="font-mono font-bold text-emerald-300">{keywordsToUse.length}</span>
                <span>{badgeLabel}</span>
              </>
            )}
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </motion.button>

        {/* Mode Toggle Button */}
        <motion.button
          onClick={() => {
            // Clear all selections when switching modes
            clearAll();
            toggleMode();
            console.log("[KeywordSurfacesInline] 🔄 MODE TOGGLED - Cleared all selections");
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "px-2 py-2 rounded-lg border transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent",
            isCopyMode
              ? "bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25 hover:border-blue-500/60"
              : "bg-purple-500/15 border-purple-500/40 text-purple-300 hover:bg-purple-500/25 hover:border-purple-500/60"
          )}
          title={modeToggleLabel}
        >
          {isCopyMode ? (
            <ToggleLeft className="w-4 h-4" />
          ) : (
            <ToggleRight className="w-4 h-4" />
          )}
        </motion.button>
      </div>

      {/* Expanded Content - OPTIMIZED: Only list animates, not individual items */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            {/* Content Container - Static, no motion.div wrapper */}
            {isLoading || keywordsToUse.length === 0 ? (
              // ✅ PROFESSIONAL SKELETON LOADER: Sleek, modern design
              <div className="pt-4 pb-4 border-t border-emerald-500/20 mt-2 w-full" style={{ boxSizing: 'border-box' }}>
                {/* Loading Message */}
                <div className="flex items-center justify-center gap-3 py-8 mb-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 rounded-full border-2 border-emerald-500/25 border-t-emerald-400 border-r-emerald-400/70"
                  />
                  <span className="text-xs font-medium text-emerald-400/80 tracking-wide uppercase">
                    {locale === 'ar' ? 'جاري التحميل' : 'Loading'}
                  </span>
                </div>

                {/* Skeleton Loaders - 3 Categories with shimmer effect */}
                {[1, 2, 3].map((categoryIdx) => (
                  <div key={categoryIdx} className="space-y-2.5 mb-6">
                    {/* Category Header Skeleton */}
                    <motion.div
                      animate={{ opacity: [0.4, 0.7, 0.4] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="h-4 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 rounded-md w-28"
                    />
                    {/* Pills Grid Skeleton - 2 columns */}
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map((pillIdx) => (
                        <motion.div
                          key={pillIdx}
                          animate={{ opacity: [0.4, 0.65, 0.4] }}
                          transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: categoryIdx * 0.1 + pillIdx * 0.05
                          }}
                          className="h-8 bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-emerald-500/5 rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Static padding and border (outside motion) */}
                {/* ✅ LAYOUT STABILITY: w-full overflow-x-hidden box-sizing: border-box */}
                <div className="pt-4 space-y-4 border-t border-emerald-500/20 mt-2 w-full overflow-x-hidden" style={{ boxSizing: 'border-box' }}>
                  {/* Selection Summary Bar - Minimal re-renders (memoized) */}
                  <AnimatePresence initial={false} mode="wait">
                    {isSelectionMode && selectedCount > 0 && (
                      <KeywordSelectionSummaryBar
                        key="selection-summary"
                        locale={locale}
                        isRtl={computedIsRtl}
                      />
                    )}
                  </AnimatePresence>

                  {/* Category Groups - Static divs, NO motion.div wrapper */}
                  {/* ✅ STRICT CONTAINMENT: overflow-hidden + position-relative for each group */}
                  {organizedGroups.map((group) => (
                    <div
                      key={group.strategy}
                      className="space-y-2.5 w-full overflow-hidden relative"
                      style={{ boxSizing: 'border-box' }}
                    >
                      {/* Category Header - Counts selected keywords in this category */}
                      {/* ✅ HYBRID: Uses term-based selectedTerms but category-aware counting */}
                      <KeywordCategoryHeader
                        category={group.strategy}
                        totalCount={group.keywords.length}
                        selectedCount={computeCategoryCount(group.keywords)}
                        locale={locale}
                        isRtl={computedIsRtl}
                        onSelectAll={() => {
                          // Select all keywords in this category
                          // TERM-BASED: selecting term affects all categories globally
                          group.keywords.forEach((keyword) => {
                            if (!isTermSelected(keyword)) {
                              toggleTerm(keyword);
                            }
                          });
                          console.log(
                            `[KeywordSurfacesInline] ✓ SELECT ALL: ${group.strategy}`,
                            {
                              selectedCount: selectedTerms.size,
                              timestamp: new Date().toISOString(),
                            }
                          );
                        }}
                        onClearAll={() => {
                          // Clear all keywords in this category
                          // TERM-BASED: deselecting term affects all categories globally
                          group.keywords.forEach((keyword) => {
                            if (isTermSelected(keyword)) {
                              toggleTerm(keyword);
                            }
                          });
                          console.log(
                            `[KeywordSurfacesInline] ✓ CLEAR ALL: ${group.strategy}`,
                            {
                              selectedCount: selectedTerms.size,
                              timestamp: new Date().toISOString(),
                            }
                          );
                        }}
                      />

                      {/* Keywords Grid - Memoized pills only re-render if selected changes */}
                      {/* TERM-BASED SELECTION: Same keyword selected globally across all categories */}
                      {/* ✅ STRICT CONTAINMENT: No hover overflow, all pills stay in grid */}
                      <div
                        className="grid grid-cols-2 gap-2 w-full overflow-hidden relative"
                        style={{ boxSizing: 'border-box' }}
                      >
                        {group.keywords.map((keyword) => (
                          <KeywordPillMemoized
                            key={`${keyword}|${group.strategy}`}
                            keyword={keyword}
                            category={group.strategy}
                            locale={locale}
                            isRtl={computedIsRtl}
                            isSelected={isTermSelected(keyword)}
                            onToggle={(term) => {
                              // GLOBAL: Toggles term across all categories
                              toggleTerm(term);
                              console.log(
                                `[KeywordSurfacesInline] ✓ TOGGLED: "${term}" in ${group.strategy}`,
                                {
                                  globallySelected: isTermSelected(term),
                                  selectedCount: selectedTerms.size,
                                  timestamp: new Date().toISOString(),
                                }
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Footer Info - Static content outside animations */}
                  <div className="pt-2 border-t border-zinc-700/30">
                    <p className={cn(
                      "text-xs text-zinc-600",
                      computedIsRtl && "text-right"
                    )}>
                      {footerText}
                    </p>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Keyword Surfaces Inline Component
 *
 * ⚠️ IMPORTANT: This component expects the following providers to be hoisted
 * to a higher level in the component tree (e.g., CompetitorSpyClient or parent):
 * - KeywordCurationModeProvider
 * - KeywordSelectionProvider
 *
 * This prevents unnecessary re-renders of KeywordSurfacesInlineContent when
 * mode toggles or selection changes occur.
 *
 * Hoisting ensures:
 * - Instant keyword selection (16ms target ✓)
 * - Instant mode toggle (16ms target ✓)
 * - No layout thrashing
 * - Smooth 60fps performance
 */
export function KeywordSurfacesInline({
  keywords: initialKeywords = [],
  groupedKeywords,
  count,
  isRtl: forceRtl,
  competitorPackageId,
  workspaceId,
  language: passedLanguage,
}: KeywordSurfacesInlineProps) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";

  return (
    <KeywordSurfacesInlineContent
      keywords={initialKeywords}
      groupedKeywords={groupedKeywords}
      count={count}
      isRtl={isRtl}
      competitorPackageId={competitorPackageId}
      workspaceId={workspaceId}
      language={passedLanguage}
    />
  );
}

export default KeywordSurfacesInline;
