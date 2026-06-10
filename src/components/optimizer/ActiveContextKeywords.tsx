/**
 * Active Context - Competitor Spy Keywords Display
 *
 * Itemized display of staged keywords from Competitor Spy module,
 * grouped by category with individual removal controls.
 *
 * Features:
 * - Display keywords as individual chips
 * - Group by category (High-Volume, Intent-Based, Competitor Gap)
 * - Remove individual keywords with state sync
 * - Bilingual labels (EN/AR)
 * - Color-coded categories
 * - Smooth animations
 * - RTL/LTR support
 *
 * Usage:
 * <ActiveContextKeywords
 *   keywords={stagedKeywords}
 *   locale="en"
 *   isRtl={false}
 *   isLoading={false}
 *   onRemoveKeyword={handleRemoveKeyword}
 * />
 */

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type KeywordDisplayItem,
  type KeywordCategory,
  groupKeywordsByCategory,
  getCategoryLabel,
  getCategoryIcon,
  getCategoryColorClasses,
  KEYWORD_CATEGORY_ORDER,
  hasCategoryKeywords,
} from "@/lib/client/optimizer-keywords-display";

export interface ActiveContextKeywordsProps {
  keywords: KeywordDisplayItem[];
  locale: string;
  isRtl?: boolean;
  isLoading?: boolean;
  onRemoveKeyword?: (keywordId: string, originalId: string) => void;
  showEmptyState?: boolean;
}

/**
 * Get empty state message
 */
function getEmptyStateMessage(locale: string): string {
  return locale === "ar"
    ? "لا توجد كلمات مفتاحية — اذهب إلى تحليل المنافسين لإضافة كلمات"
    : "None staged — visit Competitor Spy to add keywords";
}

/**
 * Active Context Keywords Component
 */
export function ActiveContextKeywords({
  keywords,
  locale,
  isRtl = false,
  isLoading = false,
  onRemoveKeyword,
  showEmptyState = true,
}: ActiveContextKeywordsProps) {
  const grouped = groupKeywordsByCategory(keywords);
  const hasKeywords = keywords.length > 0;

  // If no keywords and should show empty state
  if (!hasKeywords && showEmptyState) {
    return (
      <div className="text-[11px] italic text-white/25">
        {getEmptyStateMessage(locale)}
      </div>
    );
  }

  // If no keywords and not showing empty state
  if (!hasKeywords) {
    return null;
  }

  return (
    <div className={cn("space-y-3", isRtl && "text-right")}>
      <AnimatePresence initial={false}>
        {KEYWORD_CATEGORY_ORDER.map((category) => {
          if (!hasCategoryKeywords(grouped, category)) {
            return null;
          }

          const categoryKeywords = grouped[category] || [];
          const colors = getCategoryColorClasses(category);
          const label = getCategoryLabel(category, locale);
          const icon = getCategoryIcon(category);

          return (
            <motion.div
              key={`category-${category}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Category Header */}
              <div
                className={cn(
                  "mb-2 flex items-center gap-2",
                  isRtl && "flex-row-reverse"
                )}
              >
                <span className="text-sm font-semibold text-zinc-300">
                  {icon}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  {label}
                </span>
                <span className="text-[10px] text-zinc-600">
                  ({categoryKeywords.length})
                </span>
              </div>

              {/* Keywords List */}
              <div
                className={cn(
                  "flex flex-wrap gap-2",
                  isRtl && "justify-end"
                )}
              >
                <AnimatePresence initial={false}>
                  {categoryKeywords.map((keyword) => (
                    <motion.button
                      key={keyword.id}
                      type="button"
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => {
                        console.log("[ActiveContextKeywords] DELETE CLICKED (EN/AR SUPPORT):", {
                          locale,
                          isRtl,
                          keyword: keyword.term,
                          keywordId: keyword.id,
                          originalId: keyword.originalId,
                          signalId: keyword.originalId,
                          timestamp: new Date().toISOString(),
                        });
                        onRemoveKeyword?.(keyword.id, keyword.originalId);
                      }}
                      disabled={isLoading}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border",
                        "px-2.5 py-1.5 text-[11px] font-medium",
                        "transition-all duration-150",
                        "focus:outline-none focus:ring-2 focus:ring-offset-1",
                        colors.text,
                        colors.bg,
                        colors.border,
                        colors.hoverBg,
                        isRtl && "flex-row-reverse",
                        isLoading && "pointer-events-none opacity-60"
                      )}
                      title={`${keyword.term} (${label})`}
                      aria-label={`Remove ${keyword.term}`}
                    >
                      {/* Keyword Text */}
                      <span className="max-w-[120px] truncate">
                        {keyword.term}
                      </span>

                      {/* Remove Button */}
                      {!isLoading && (
                        <motion.span
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          className={cn(
                            "rounded-full p-0.5 transition",
                            colors.removeBg
                          )}
                        >
                          <X className="size-3" />
                        </motion.span>
                      )}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ActiveContextKeywords;
