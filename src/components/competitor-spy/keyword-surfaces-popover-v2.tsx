/**
 * Keyword Surfaces Popover V2
 *
 * Professional popover component with:
 * - Anchored to trigger (no modal centering)
 * - Dark dashboard theme matching
 * - Structured keyword layout with grouped sections
 * - Copy button per keyword + Copy All
 * - Full RTL/LTR support
 * - Framer Motion animations
 * - Proper floating appearance
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

interface KeywordSurfacesPopoverV2Props {
  keywords: string[];
  groupedKeywords?: KeywordGroup[];
  count: number;
  isRtl?: boolean;
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
      en: "High-Volume Keywords",
      ar: "كلمات مفتاحية عالية الحجم",
    },
    intent_based: {
      en: "Intent-Based Keywords",
      ar: "كلمات مفتاحية موجهة بالنية",
    },
    competitor_gap: {
      en: "Competitor Gap Opportunities",
      ar: "فرص الفجوات التنافسية",
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
 * Individual Keyword Chip
 */
function KeywordChip({
  keyword,
  locale,
}: {
  keyword: string;
  locale: string;
}) {
  const [copied, setCopied] = useState(false);
  const isRtl = locale === "ar";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-zinc-800/50 border border-zinc-700/50",
        "hover:bg-zinc-700/50 hover:border-zinc-600/50",
        "transition-all duration-150",
        isRtl && "flex-row-reverse"
      )}
    >
      <span className="text-sm text-zinc-200 flex-1">{keyword}</span>
      <button
        onClick={handleCopy}
        className={cn(
          "p-1 rounded transition-all duration-150",
          "text-zinc-500 hover:text-zinc-300",
          "hover:bg-zinc-600/30",
          isRtl && "order-first"
        )}
        title={locale === "ar" ? "انسخ" : "Copy"}
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-400" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </motion.div>
  );
}

/**
 * Main Keyword Surfaces Popover V2 Component
 */
export function KeywordSurfacesPopoverV2({
  keywords,
  groupedKeywords,
  count,
  isRtl: forceRtl,
}: KeywordSurfacesPopoverV2Props) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const organizedGroups = organizeKeywords(keywords, groupedKeywords);
  const badgeLabel = locale === "ar" ? `كلمات مفتاحية` : `keywords`;

  // Calculate popover position relative to trigger
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
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
      // Show toast or feedback
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
        title={locale === "ar" ? "اضغط لعرض الكلمات" : "Click to see keywords"}
      >
        <span className="font-mono font-bold text-emerald-300">{count}</span>
        <span>{badgeLabel}</span>
      </motion.button>

      {/* Popover Backdrop */}
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

      {/* Popover Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed z-50 w-96 rounded-xl",
              "bg-gradient-to-br from-zinc-800 to-zinc-900",
              "border border-zinc-700/50 shadow-xl",
              "overflow-hidden"
            )}
            style={{
              top: `${position.top}px`,
              [isRtl ? "right" : "left"]: `${position.left}px`,
            }}
            dir={isRtl ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className="border-b border-zinc-700/30 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {locale === "ar"
                    ? "سطح الكلمات المفتاحية"
                    : "Keyword Surfaces"}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  {locale === "ar"
                    ? `${count} كلمة مفتاحية`
                    : `${count} keywords`}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded transition-all duration-150 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Copy All Button */}
            <div className="px-6 py-3 border-b border-zinc-700/20">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCopyAll}
                className={cn(
                  "w-full py-2 px-3 rounded-lg text-sm font-medium",
                  "bg-emerald-600/20 hover:bg-emerald-600/30",
                  "border border-emerald-600/30 hover:border-emerald-600/50",
                  "text-emerald-300 hover:text-emerald-200",
                  "transition-all duration-150"
                )}
              >
                {locale === "ar" ? "نسخ الكل" : "Copy All"}
              </motion.button>
            </div>

            {/* Keyword Groups */}
            <div className="space-y-5 px-6 py-4 max-h-96 overflow-y-auto">
              {organizedGroups.map((group, groupIndex) => (
                <motion.div
                  key={group.strategy}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIndex * 0.1 }}
                  className="space-y-2.5"
                >
                  {/* Group Label */}
                  <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                    <div className="h-px flex-1 bg-gradient-to-r from-zinc-700/50 to-transparent rounded" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                      {getStrategyLabel(group.strategy, locale)}
                    </p>
                    <div className="h-px flex-1 bg-gradient-to-l from-zinc-700/50 to-transparent rounded" />
                  </div>

                  {/* Keywords */}
                  <div className="space-y-2">
                    {group.keywords.map((keyword) => (
                      <KeywordChip
                        key={keyword}
                        keyword={keyword}
                        locale={locale}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer Info */}
            <div className="border-t border-zinc-700/20 px-6 py-3 bg-zinc-900/50">
              <p className="text-xs text-zinc-500">
                {locale === "ar"
                  ? "اضغط على أي كلمة لنسخها"
                  : "Click any keyword to copy it"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default KeywordSurfacesPopoverV2;
