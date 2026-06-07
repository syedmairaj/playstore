/**
 * Keyword Surfaces Popover Component
 *
 * Displays keywords grouped by strategy (High-Volume, Intent-Based, Competitor Gap)
 * with full RTL/LTR and localization support.
 *
 * Features:
 * - Radix UI Popover for accessibility
 * - Grouped keyword display by strategy
 * - Full EN/AR localization
 * - RTL-aware positioning and alignment
 * - Click-to-copy keyword functionality (optional)
 */

"use client";

import * as Popover from "@radix-ui/react-popover";
import { useLocale } from "next-intl";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface KeywordGroup {
  strategy: "high_volume" | "intent_based" | "competitor_gap";
  keywords: string[];
}

export interface KeywordSurfacesPopoverProps {
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
 * If no grouped data provided, distribute evenly for demo
 */
function organizeKeywords(
  keywords: string[],
  groupedKeywords?: KeywordGroup[]
): KeywordGroup[] {
  if (groupedKeywords && groupedKeywords.length > 0) {
    return groupedKeywords;
  }

  // Default grouping: distribute evenly
  const groups: KeywordGroup[] = [
    {
      strategy: "high_volume",
      keywords: keywords.slice(0, Math.ceil(keywords.length / 3)),
    },
    {
      strategy: "intent_based",
      keywords: keywords.slice(Math.ceil(keywords.length / 3), Math.ceil((keywords.length * 2) / 3)),
    },
    {
      strategy: "competitor_gap",
      keywords: keywords.slice(Math.ceil((keywords.length * 2) / 3)),
    },
  ];

  return groups.filter((g) => g.keywords.length > 0);
}

/**
 * Keyword Chip with Copy Functionality
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
    <button
      onClick={handleCopy}
      className={cn(
        "group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
        "bg-emerald-500/10 border border-emerald-500/30",
        "hover:bg-emerald-500/15 hover:border-emerald-500/50",
        "text-emerald-300 text-sm font-medium",
        "transition-all duration-150",
        "cursor-pointer",
        isRtl && "flex-row-reverse"
      )}
      title={locale === "ar" ? "انسخ الكلمة" : "Copy keyword"}
    >
      <span className="break-words">{keyword}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
      )}
    </button>
  );
}

/**
 * Main Keyword Surfaces Popover Component
 */
export function KeywordSurfacesPopover({
  keywords,
  groupedKeywords,
  count,
  isRtl: forceRtl,
}: KeywordSurfacesPopoverProps) {
  const locale = useLocale();
  const isRtl = forceRtl !== undefined ? forceRtl : locale === "ar";

  const organizedGroups = organizeKeywords(keywords, groupedKeywords);

  const badgeLabel = locale === "ar" ? `${count} كلمة مفتاحية` : `${count} keywords`;
  const copiedMessage = locale === "ar" ? "انسخ الكلمات" : "Copy keywords";

  return (
    <Popover.Root>
      {/* Trigger Badge */}
      <Popover.Trigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
            "bg-emerald-500/10 border border-emerald-500/25",
            "hover:bg-emerald-500/15 hover:border-emerald-500/40",
            "text-emerald-200 text-xs font-semibold",
            "transition-all duration-150",
            "cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
            isRtl && "flex-row-reverse"
          )}
          title={copiedMessage}
        >
          <span className="font-mono font-bold text-emerald-300">{count}</span>
          <span>{badgeLabel}</span>
        </button>
      </Popover.Trigger>

      {/* Content Popover */}
      <Popover.Content
        side={isRtl ? "left" : "right"}
        align="start"
        sideOffset={8}
        className={cn(
          "z-50 w-80 rounded-lg border border-zinc-700/50",
          "bg-gradient-to-b from-zinc-800/95 to-zinc-900/95",
          "backdrop-blur-sm shadow-2xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2"
        )}
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className={cn("border-b border-zinc-700/30 px-4 py-3")}>
          <h3 className="text-sm font-semibold text-white">
            {locale === "ar" ? "سطح الكلمات المفتاحية" : "Keyword Surfaces"}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {locale === "ar"
              ? "الكلمات المفتاحية مجمعة حسب الاستراتيجية"
              : "Keywords grouped by strategy"}
          </p>
        </div>

        {/* Groups */}
        <div className="space-y-3 px-4 py-3">
          {organizedGroups.map((group) => (
            <div key={group.strategy} className="space-y-1.5">
              {/* Group Label */}
              <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                <div className="h-0.5 flex-1 bg-gradient-to-r from-emerald-500/20 to-transparent rounded" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 whitespace-nowrap">
                  {getStrategyLabel(group.strategy, locale)}
                </p>
                <div className="h-0.5 flex-1 bg-gradient-to-l from-emerald-500/20 to-transparent rounded" />
              </div>

              {/* Keywords */}
              <div
                className={cn(
                  "flex flex-wrap gap-2",
                  isRtl ? "justify-end" : "justify-start"
                )}
              >
                {group.keywords.map((keyword) => (
                  <KeywordChip key={keyword} keyword={keyword} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="border-t border-zinc-700/30 px-4 py-2.5 bg-zinc-900/50">
          <p className="text-[11px] text-zinc-500">
            {locale === "ar"
              ? "اضغط على أي كلمة مفتاحية لنسخها"
              : "Click any keyword to copy it"}
          </p>
        </div>

        {/* Radix Close Button */}
        <Popover.Close
          className={cn(
            "absolute w-6 h-6 inline-flex items-center justify-center",
            "text-zinc-400 hover:text-zinc-200",
            "rounded-md hover:bg-zinc-700/50",
            "transition-all duration-150",
            isRtl ? "left-2 top-2" : "right-2 top-2"
          )}
          aria-label="Close"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Popover.Close>
      </Popover.Content>
    </Popover.Root>
  );
}

export default KeywordSurfacesPopover;
