/**
 * Keyword Surfaces Popover - High-End ASO Dashboard
 *
 * Premium aesthetic with:
 * - Refined header with uppercase tracking
 * - 2-column grid of colored keyword chips (strategy-based colors)
 * - Secondary copy button (transparent border style)
 * - Hover opacity interactions
 * - Deep floating effect with ring + shadow
 * - Dense, compact layout
 * - Full RTL compatibility
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Copy, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface KeywordGroup {
  strategy: "high_volume" | "intent_based" | "competitor_gap";
  keywords: string[];
}

interface KeywordSurfacesPopoverRefinedProps {
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
      label: "text-zinc-400",
      hover: "hover:bg-blue-500/25 hover:border-blue-500/60",
    },
    intent_based: {
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/40",
      text: "text-emerald-300",
      label: "text-zinc-400",
      hover: "hover:bg-emerald-500/25 hover:border-emerald-500/60",
    },
    competitor_gap: {
      bg: "bg-amber-500/15",
      border: "border-amber-500/40",
      text: "text-amber-300",
      label: "text-zinc-400",
      hover: "hover:bg-amber-500/25 hover:border-amber-500/60",
    },
  };
  return colors[strategy];
}

/**
 * Get localized labels for strategies
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
 * Group keywords by strategy
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
 * Individual Keyword Chip - Grid Style
 */
function KeywordChip({
  keyword,
  strategy,
  onCopy,
  locale,
}: {
  keyword: string;
  strategy: "high_volume" | "intent_based" | "competitor_gap";
  onCopy: (keyword: string) => void;
  locale: string;
}) {
  const [copied, setCopied] = useState(false);
  const colors = getStrategyColor(strategy);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyword);
      setCopied(true);
      onCopy(keyword);
      setTimeout(() => setCopied(false), 2000);
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
        "relative group px-3 py-2 rounded-lg text-sm font-medium",
        "transition-all duration-150",
        colors.bg,
        colors.border,
        colors.text,
        "border",
        colors.hover,
        "cursor-pointer overflow-hidden"
      )}
      title={locale === "ar" ? "انسخ" : "Copy"}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />

      {/* Content */}
      <span className="relative flex items-center justify-between gap-1.5">
        <span className="truncate text-xs">{keyword}</span>
        {copied ? (
          <Check className="w-3 h-3 flex-shrink-0" />
        ) : (
          <Copy className="w-3 h-3 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
        )}
      </span>
    </motion.button>
  );
}

/**
 * Copy All Icon Button
 */
function CopyAllButton({
  onClick,
  locale,
  copied,
}: {
  onClick: () => void;
  locale: string;
  copied: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-lg transition-all duration-150",
        "text-zinc-400 hover:text-zinc-200",
        "hover:bg-zinc-700/30",
        "border border-zinc-700/50 hover:border-zinc-600/50"
      )}
      title={locale === "ar" ? "نسخ الكل" : "Copy all"}
    >
      {copied ? (
        <Check className="w-4 h-4 text-emerald-400" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </motion.button>
  );
}

/**
 * Main Keyword Surfaces Popover - Refined
 */
export function KeywordSurfacesPopoverRefined({
  keywords,
  groupedKeywords,
  count,
  isRtl: forceRtl,
}: KeywordSurfacesPopoverRefinedProps) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const organizedGroups = organizeKeywords(keywords, groupedKeywords);
  const badgeLabel = locale === "ar" ? `كلمات مفتاحية` : `keywords`;

  // Calculate popover position
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 12,
      left: isRtl
        ? window.innerWidth - rect.right
        : rect.left,
    });
  }, [isOpen, isRtl]);

  // Copy all keywords
  const handleCopyAll = async () => {
    const allKeywords = keywords.join(", ");
    try {
      await navigator.clipboard.writeText(allKeywords);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error("Failed to copy all:", err);
    }
  };

  return (
    <div className="relative inline-block">
      {/* Trigger Badge */}
      <motion.button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full",
          "bg-emerald-500/15 border border-emerald-500/40",
          "hover:bg-emerald-500/25 hover:border-emerald-500/60",
          "text-emerald-200 text-sm font-semibold",
          "transition-all duration-150",
          "cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
          isRtl && "flex-row-reverse"
        )}
      >
        <span className="font-mono font-bold text-emerald-300">{count}</span>
        <span>{badgeLabel}</span>
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed z-50 w-96 rounded-xl",
              "bg-gradient-to-br from-zinc-800/95 to-zinc-900/95",
              "border border-zinc-700/50",
              "ring-1 ring-white/10",
              "shadow-2xl shadow-black/60",
              "overflow-hidden"
            )}
            style={{
              top: `${position.top}px`,
              [isRtl ? "right" : "left"]: `${position.left}px`,
            }}
            dir={isRtl ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className="border-b border-zinc-700/30 px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <p className={cn(
                  "text-xs uppercase tracking-wider font-semibold",
                  "text-zinc-500"
                )}>
                  {locale === "ar"
                    ? "سطح الكلمات المفتاحية"
                    : "Keyword Surfaces"}
                </p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {count} {locale === "ar" ? "كلمة" : "keywords"}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <CopyAllButton
                  onClick={handleCopyAll}
                  locale={locale}
                  copied={copiedAll}
                />
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg transition-all duration-150 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Keyword Groups */}
            <div className="space-y-4 px-5 py-4 max-h-80 overflow-y-auto">
              {organizedGroups.map((group, groupIndex) => (
                <motion.div
                  key={group.strategy}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIndex * 0.08 }}
                  className="space-y-2.5"
                >
                  {/* Group Label */}
                  <p className={cn(
                    "text-xs font-semibold uppercase tracking-wider",
                    "text-zinc-500"
                  )}>
                    {getStrategyLabel(group.strategy, locale)}
                  </p>

                  {/* 2-Column Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {group.keywords.map((keyword) => (
                      <KeywordChip
                        key={keyword}
                        keyword={keyword}
                        strategy={group.strategy}
                        onCopy={() => {}}
                        locale={locale}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-700/20 px-5 py-2.5 bg-zinc-900/50">
              <p className="text-[10px] text-zinc-600">
                {locale === "ar"
                  ? "اضغط على أي كلمة لنسخها"
                  : "Click any keyword to copy"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default KeywordSurfacesPopoverRefined;
