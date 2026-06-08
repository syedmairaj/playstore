/**
 * Keyword Surfaces Component with Curation Engine
 *
 * Enhanced version of keyword-surfaces-inline that adds:
 * - Multi-select capability with visual feedback
 * - Category mapping (high_volume, intent_based, competitor_gap)
 * - Floating action bar for batch operations
 * - Integration with staging vault service
 *
 * Replaces the static "copy" UI with an interactive curation experience.
 */

"use client";

import React, { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { ChevronDown, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useKeywordSelection } from "@/hooks/useKeywordSelection";
import { KeywordPillCurate } from "@/components/competitor-spy/keyword-pill-curate";
import { KeywordCurationFloatingBar } from "@/components/competitor-spy/keyword-curation-floating-bar";
import type { KeywordCategory } from "@/hooks/useKeywordSelection";

interface KeywordGroup {
  strategy: KeywordCategory;
  keywords: string[];
}

interface KeywordSurfacesCurationProps {
  keywords?: string[];
  groupedKeywords?: KeywordGroup[];
  count: number;
  isRtl?: boolean;
  competitorPackageId?: string;
  competitorName?: string;
  workspaceId?: string;
  appId?: string;
  language?: string;
  curateMode?: boolean; // If true, enables selection mode. If false, copy mode.
}

/**
 * Get strategy color scheme
 */
function getStrategyColor(strategy: KeywordCategory) {
  const colors = {
    high_volume: {
      bg: "bg-blue-500/15",
      border: "border-blue-500/40",
      text: "text-blue-300",
    },
    intent_based: {
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/40",
      text: "text-emerald-300",
    },
    competitor_gap: {
      bg: "bg-amber-500/15",
      border: "border-amber-500/40",
      text: "text-amber-300",
    },
  };
  return colors[strategy];
}

/**
 * Get localized strategy label
 */
function getStrategyLabel(strategy: KeywordCategory, locale: string): string {
  const labels: Record<KeywordCategory, Record<string, string>> = {
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
 * Keyword Surfaces Curation Component
 */
export function KeywordSurfacesCuration({
  keywords: initialKeywords = [],
  groupedKeywords,
  count,
  isRtl: forceRtl,
  competitorPackageId,
  competitorName = "Unknown",
  workspaceId,
  appId,
  language: passedLanguage,
  curateMode = true,
}: KeywordSurfacesCurationProps) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";

  // State management
  const [isExpanded, setIsExpanded] = useState(false);
  const [fetchedKeywords, setFetchedKeywords] = useState<string[]>(initialKeywords);
  const [isLoading, setIsLoading] = useState(false);
  const language = passedLanguage || (isRtl ? "ar" : "en");

  // Keyword selection hook
  const selection = useKeywordSelection(locale);

  // ═════════════════════════════════════════════════════════════════════════
  // FETCH: Keywords from staging vault (same as original)
  // ═════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!competitorPackageId || !workspaceId) {
      setFetchedKeywords(initialKeywords);
      return;
    }

    const fetchKeywords = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/competitors/${competitorPackageId}/keywords?language=${language}`,
          { method: "GET", headers: { "Content-Type": "application/json" } }
        );

        if (!response.ok) {
          console.warn("[KeywordSurfacesCuration] API error:", response.status);
          setFetchedKeywords(initialKeywords);
          return;
        }

        const data = await response.json();
        let keywordsArray: string[] = [];

        if (data.keywords) {
          if (typeof data.keywords === "object" && !Array.isArray(data.keywords)) {
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
            "[KeywordSurfacesCuration] Fetched",
            keywordsArray.length,
            "keywords"
          );
          setFetchedKeywords(keywordsArray);
        } else {
          setFetchedKeywords(initialKeywords);
        }
      } catch (error) {
        console.error("[KeywordSurfacesCuration] Fetch error:", error);
        setFetchedKeywords(initialKeywords);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeywords();
  }, [competitorPackageId, language, workspaceId, initialKeywords]);

  const keywordsToUse = fetchedKeywords.length > 0 ? fetchedKeywords : initialKeywords;
  const organizedGroups = organizeKeywords(keywordsToUse, groupedKeywords);
  const badgeLabel = locale === "ar" ? "كلمات مفتاحية" : "keywords";

  const triggerLabel = locale === "ar"
    ? `${keywordsToUse.length} كلمات مفتاحية`
    : `${keywordsToUse.length} keywords`;

  const modeLabel = curateMode
    ? locale === "ar"
      ? "انقر لتحديد"
      : "Click to select"
    : locale === "ar"
    ? "انقر للنسخ"
    : "Click to copy";

  return (
    <div className="w-full space-y-0">
      {/* Floating Action Bar - Only shows when keywords selected */}
      {curateMode && workspaceId && (
        <KeywordCurationFloatingBar
          isRtl={isRtl}
          selectedCount={selection.selectedCount}
          countByCategory={selection.countByCategory}
          selectedKeywords={selection.getSelectedKeywords()}
          workspaceId={workspaceId}
          appId={appId}
          competitorId={competitorPackageId || ""}
          competitorName={competitorName}
          onClear={selection.clearAll}
          formattedSummary={selection.formattedSummary}
          onSuccess={(signalId) => {
            console.log("[KeywordSurfacesCuration] Keywords sent successfully:", {
              signalId,
            });
            // Auto-collapse after successful send
            setIsExpanded(false);
          }}
        />
      )}

      {/* Expand/Collapse Trigger Button */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={isLoading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg",
          "bg-emerald-500/15 border border-emerald-500/40",
          "hover:bg-emerald-500/25 hover:border-emerald-500/60",
          "text-emerald-200 text-sm font-semibold",
          "transition-all duration-150",
          "cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
          isLoading && "opacity-60 cursor-wait",
          isRtl && "flex-row-reverse",
          curateMode && selection.selectedCount > 0 && "ring-2 ring-emerald-500/50"
        )}
      >
        <span className={cn("flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
          <span className="font-mono font-bold text-emerald-300">
            {keywordsToUse.length}
          </span>
          <span>{badgeLabel}</span>
          {curateMode && selection.selectedCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-100 text-xs font-bold"
            >
              {selection.selectedCount}
            </motion.span>
          )}
        </span>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
          className={cn("flex-shrink-0", isLoading && "animate-spin")}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.button>

      {/* Expanded Content - Animated Height */}
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
            {/* Content Container */}
            <div className="pt-4 space-y-4 border-t border-emerald-500/20 mt-2">
              {/* Mode Indicator */}
              {curateMode && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md",
                    "bg-emerald-500/15 border border-emerald-500/30",
                    "text-emerald-200 text-xs font-medium",
                    isRtl && "flex-row-reverse"
                  )}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>
                    {locale === "ar" ? "وضع المحرّر" : "Curation Mode"}
                  </span>
                </motion.div>
              )}

              {/* Keyword Groups */}
              {organizedGroups.map((group, groupIndex) => (
                <motion.div
                  key={group.strategy}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIndex * 0.05 }}
                  className="space-y-2.5"
                >
                  {/* Group Header */}
                  <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      getStrategyColor(group.strategy).bg
                    )} />
                    <h4 className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-zinc-400",
                      isRtl && "text-right"
                    )}>
                      {getStrategyLabel(group.strategy, locale)}
                    </h4>
                    <span className="text-xs text-zinc-600">
                      ({group.keywords.length})
                    </span>
                    {curateMode && (
                      <span className="text-xs text-emerald-500/70">
                        {selection.countByCategory[group.strategy] > 0
                          ? `(${selection.countByCategory[group.strategy]} ${locale === "ar" ? "مختارة" : "selected"})`
                          : ""}
                      </span>
                    )}
                  </div>

                  {/* High-Density 2-Column Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {group.keywords.map((keyword, idx) => (
                      <KeywordPillCurate
                        key={`${keyword}-${idx}`}
                        keyword={keyword}
                        category={group.strategy}
                        locale={locale}
                        isRtl={isRtl}
                        isSelected={curateMode ? selection.isSelected(keyword) : false}
                        onToggle={curateMode ? selection.toggleKeyword : undefined}
                        curateMode={curateMode}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}

              {/* Footer Info */}
              <div className="pt-2 border-t border-zinc-700/30">
                <p className={cn(
                  "text-xs text-zinc-600",
                  isRtl && "text-right"
                )}>
                  {modeLabel}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default KeywordSurfacesCuration;
