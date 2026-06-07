/**
 * Keyword Surfaces Inline Expandable Container
 *
 * Features:
 * - Expands inline within the snapshot container
 * - No modals, drawers, or popovers
 * - Animated height transition using framer-motion
 * - Dense 2-column grid layout
 * - Color-coded keyword chips (blue/green/amber by strategy)
 * - Full RTL support
 * - Copy-to-clipboard with visual feedback
 * - Chevron icon indicates expanded/collapsed state
 */

"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Copy, Check, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface KeywordGroup {
  strategy: "high_volume" | "intent_based" | "competitor_gap";
  keywords: string[];
}

interface KeywordSurfacesInlineProps {
  keywords: string[];
  groupedKeywords?: KeywordGroup[];
  count: number;
  isRtl?: boolean;
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
 * Keyword Pill Component
 */
function KeywordPill({
  keyword,
  strategy,
  locale,
}: {
  keyword: string;
  strategy: "high_volume" | "intent_based" | "competitor_gap";
  locale: string;
}) {
  const [copied, setCopied] = useState(false);
  const colors = getStrategyColor(strategy);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <motion.button
      onClick={handleCopy}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative px-3 py-2 rounded-lg text-sm font-medium",
        "border transition-all duration-150",
        colors.bg,
        colors.border,
        colors.text,
        colors.hover,
        "cursor-pointer overflow-hidden"
      )}
      title={locale === "ar" ? "انسخ" : "Copy"}
    >
      <span className="relative flex items-center justify-between gap-2">
        <span className="truncate text-xs">{keyword}</span>
        {copied ? (
          <Check className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <Copy className="w-3.5 h-3.5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
        )}
      </span>
    </motion.button>
  );
}

/**
 * Keyword Surfaces Inline Component
 */
export function KeywordSurfacesInline({
  keywords,
  groupedKeywords,
  count,
  isRtl: forceRtl,
}: KeywordSurfacesInlineProps) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";
  const [isExpanded, setIsExpanded] = useState(false);

  const organizedGroups = organizeKeywords(keywords, groupedKeywords);
  const badgeLabel = locale === "ar" ? `كلمات مفتاحية` : `keywords`;

  return (
    <div className="w-full space-y-0">
      {/* Trigger Button */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg",
          "bg-emerald-500/15 border border-emerald-500/40",
          "hover:bg-emerald-500/25 hover:border-emerald-500/60",
          "text-emerald-200 text-sm font-semibold",
          "transition-all duration-150",
          "cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
          isRtl && "flex-row-reverse"
        )}
      >
        <span className={cn("flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
          <span className="font-mono font-bold text-emerald-300">{count}</span>
          <span>{badgeLabel}</span>
        </span>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
          className="flex-shrink-0"
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
                    <h4 className={cn(
                      "text-xs font-semibold uppercase tracking-wider text-zinc-400",
                      isRtl && "text-right"
                    )}>
                      {getStrategyLabel(group.strategy, locale)}
                    </h4>
                    <span className="text-xs text-zinc-600">({group.keywords.length})</span>
                  </div>

                  {/* High-Density 2-Column Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {group.keywords.map((keyword, idx) => (
                      <KeywordPill
                        key={`${keyword}-${idx}`}
                        keyword={keyword}
                        strategy={group.strategy}
                        locale={locale}
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
                  {locale === "ar"
                    ? "اضغط على أي كلمة لنسخها"
                    : "Click any keyword to copy"}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default KeywordSurfacesInline;
