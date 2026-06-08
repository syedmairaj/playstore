/**
 * Keyword Surfaces Drawer - Professional ASO Workbench
 *
 * Right-side slide-over drawer with:
 * - Full viewport height coverage
 * - No internal scrolling (smooth page scroll)
 * - Dark theme matching dashboard
 * - Copy All action in header
 * - Color-coded keyword pills in high-density grid
 * - Smooth framer-motion slide-in animation
 * - Full RTL support
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

interface KeywordSurfacesDrawerProps {
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
        <span className="truncate">{keyword}</span>
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
 * Copy All Button
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
        "p-2 rounded-lg transition-all duration-150",
        "text-zinc-400 hover:text-zinc-200",
        "hover:bg-zinc-800/50",
        "border border-zinc-700/50 hover:border-zinc-600/50"
      )}
      title={locale === "ar" ? "نسخ الكل" : "Copy all"}
    >
      {copied ? (
        <Check className="w-5 h-5 text-emerald-400" />
      ) : (
        <Copy className="w-5 h-5" />
      )}
    </motion.button>
  );
}

/**
 * Main Keyword Surfaces Drawer Component
 */
export function KeywordSurfacesDrawer({
  keywords,
  groupedKeywords,
  count,
  isRtl: forceRtl,
}: KeywordSurfacesDrawerProps) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const organizedGroups = organizeKeywords(keywords, groupedKeywords);
  const badgeLabel = locale === "ar" ? `كلمات مفتاحية` : `keywords`;

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Copy all keywords
  const handleCopyAll = async () => {
    const allKeywords = keywords.join(", ");
    try {
      await navigator.clipboard.writeText(allKeywords);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch (err) {
      console.error("Failed to copy all:", err);
    }
  };

  return (
    <div className="relative inline-block">
      {/* Trigger Badge */}
      <motion.button
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
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
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{
              x: isRtl ? "-100%" : "100%",
              opacity: 0,
            }}
            animate={{
              x: 0,
              opacity: 1,
            }}
            exit={{
              x: isRtl ? "-100%" : "100%",
              opacity: 0,
            }}
            transition={{
              duration: 0.3,
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            className={cn(
              "fixed z-50 top-0 h-full w-full max-w-2xl",
              "bg-zinc-950 border-l border-zinc-800",
              "flex flex-col overflow-hidden",
              isRtl ? "right-0 border-r border-l-0" : "left-0"
            )}
            dir={isRtl ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-950/50 backdrop-blur">
              <div className="flex items-center justify-between px-6 py-4 gap-4">
                <div>
                  <h2 className={cn(
                    "text-lg font-semibold text-white",
                    locale === "ar" && "text-right"
                  )}>
                    {locale === "ar"
                      ? "سطح الكلمات المفتاحية"
                      : "Keyword Surfaces"}
                  </h2>
                  <p className={cn(
                    "text-sm text-zinc-500 mt-1",
                    locale === "ar" && "text-right"
                  )}>
                    {count} {locale === "ar" ? "كلمة مفتاحية" : "keywords"}
                  </p>
                </div>

                <div className={cn(
                  "flex items-center gap-2",
                  isRtl && "flex-row-reverse"
                )}>
                  <CopyAllButton
                    onClick={handleCopyAll}
                    locale={locale}
                    copied={copiedAll}
                  />
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg transition-all duration-150 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Content - Full Height Scroll */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-8 px-6 py-6">
                {organizedGroups.map((group, groupIndex) => (
                  <motion.div
                    key={group.strategy}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: groupIndex * 0.1 }}
                    className="space-y-4"
                  >
                    {/* Group Header */}
                    <div className={cn(
                      "flex items-center gap-3",
                      isRtl && "flex-row-reverse"
                    )}>
                      <div className="h-1 w-12 rounded-full bg-gradient-to-r from-blue-500/30 to-transparent" />
                      <h3 className={cn(
                        "text-sm font-semibold uppercase tracking-wider text-zinc-400",
                        isRtl && "text-right"
                      )}>
                        {getStrategyLabel(group.strategy, locale)}
                      </h3>
                      <span className="text-xs text-zinc-600">
                        {group.keywords.length}
                      </span>
                    </div>

                    {/* High-Density Keyword Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
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
              </div>
            </div>

            {/* Footer Info */}
            <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-950/50 backdrop-blur px-6 py-3">
              <p className={cn(
                "text-xs text-zinc-600",
                locale === "ar" && "text-right"
              )}>
                {locale === "ar"
                  ? "اضغط على أي كلمة لنسخها إلى الحافظة"
                  : "Click any keyword to copy to clipboard"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default KeywordSurfacesDrawer;
