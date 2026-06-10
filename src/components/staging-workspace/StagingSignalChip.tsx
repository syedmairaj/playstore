/**
 * StagingSignalChip.tsx
 *
 * Individual signal chip component for displaying a single signal in the Staging Workspace.
 * Supports all three pillar types (Review Issues, Market Opportunities, Competitor Keywords)
 * with appropriate metadata display and removal capabilities.
 *
 * Features:
 * - Itemized display with source-specific styling
 * - Inline removal with × button
 * - Category badges for keywords
 * - Bilingual labels (EN/AR)
 * - Smooth animations on mount/remove
 * - Loading state during API call
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, TrendingUp, Shield } from "lucide-react";
import type {
  StagingSignal,
  ReviewIssueSignal,
  MarketOpportunitySignal,
  CompetitorKeywordSignal,
  ChipDisplayOptions,
  RemovalHandler,
} from "@/lib/client/staging-workspace-types";

interface StagingSignalChipProps {
  signal: StagingSignal;
  locale: "en" | "ar";
  isRtl: boolean;
  onRemove: RemovalHandler;
  displayOptions?: ChipDisplayOptions;
}

/**
 * Get display text and styling based on signal type
 */
function getSignalDisplay(signal: StagingSignal, locale: "en" | "ar") {
  const isArabic = locale === "ar";

  if (signal.source === "review_issue") {
    const issue = signal as ReviewIssueSignal;
    return {
      icon: AlertTriangle,
      iconColor: "text-rose-400/80",
      bgColor: "bg-rose-500/10",
      borderColor: "border-rose-500/25",
      textColor: "text-rose-200/90",
      hoverColor: "hover:bg-rose-500/20",
      removeBtnColor: "text-rose-400/50 hover:bg-rose-500/20 hover:text-rose-300",
      mainText: issue.content,
      severity: issue.severity ? `[${isArabic ? getSeverityArabic(issue.severity) : issue.severity.toUpperCase()}]` : "",
    };
  }

  if (signal.source === "market_spotlight") {
    const market = signal as MarketOpportunitySignal;
    return {
      icon: TrendingUp,
      iconColor: "text-emerald-400/80",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/25",
      textColor: "text-emerald-200/90",
      hoverColor: "hover:bg-emerald-500/20",
      removeBtnColor: "text-emerald-400/50 hover:bg-emerald-500/20 hover:text-emerald-300",
      mainText: market.keyword,
      metadata: market.searchVolume
        ? `${market.searchVolume.toLocaleString()} ${isArabic ? "عمليات بحث" : "searches"}`
        : market.trend
          ? isArabic
            ? getTrendArabic(market.trend)
            : market.trend.charAt(0).toUpperCase() + market.trend.slice(1)
          : "",
    };
  }

  if (signal.source === "competitor_keyword") {
    const keyword = signal as CompetitorKeywordSignal;
    const categoryLabels = {
      high_volume: isArabic ? "عالي الحجم" : "High-Volume",
      intent_based: isArabic ? "موجه بالنية" : "Intent-Based",
      competitor_gap: isArabic ? "فجوة تنافسية" : "Competitor Gap",
    };

    return {
      icon: Shield,
      iconColor: "text-sky-400/80",
      bgColor: "bg-sky-500/10",
      borderColor: "border-sky-500/25",
      textColor: "text-sky-200/90",
      hoverColor: "hover:bg-sky-500/20",
      removeBtnColor: "text-sky-400/50 hover:bg-sky-500/20 hover:text-sky-300",
      mainText: keyword.keyword,
      category: categoryLabels[keyword.category],
      categoryColor: getCategoryColor(keyword.category),
    };
  }

  return {
    icon: AlertTriangle,
    iconColor: "text-gray-400/80",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/25",
    textColor: "text-gray-200/90",
    hoverColor: "hover:bg-gray-500/20",
    removeBtnColor: "text-gray-400/50 hover:bg-gray-500/20 hover:text-gray-300",
    mainText: "Unknown signal",
  };
}

function getSeverityArabic(severity: string): string {
  const map: Record<string, string> = {
    low: "منخفض",
    medium: "متوسط",
    high: "عالي",
  };
  return map[severity] || severity;
}

function getTrendArabic(trend: string): string {
  const map: Record<string, string> = {
    rising: "صاعد",
    stable: "مستقر",
    declining: "هابط",
  };
  return map[trend] || trend;
}

function getCategoryColor(
  category: string
): { bg: string; text: string; border: string } {
  const colors = {
    high_volume: {
      bg: "bg-sky-500/15",
      text: "text-sky-300",
      border: "border-sky-500/30",
    },
    intent_based: {
      bg: "bg-purple-500/15",
      text: "text-purple-300",
      border: "border-purple-500/30",
    },
    competitor_gap: {
      bg: "bg-orange-500/15",
      text: "text-orange-300",
      border: "border-orange-500/30",
    },
  };
  return colors[category as keyof typeof colors] || colors.high_volume;
}

export default function StagingSignalChip({
  signal,
  locale,
  isRtl,
  onRemove,
  displayOptions = {
    showRemoveButton: true,
    showCategory: true,
    showMetadata: true,
    animateOnRemove: true,
  },
}: StagingSignalChipProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const display = getSignalDisplay(signal, locale);
  const IconComponent = display.icon;

  const handleRemove = async () => {
    if (!displayOptions.showRemoveButton) return;

    setIsRemoving(true);
    try {
      await onRemove(signal.id, signal.source);
    } catch (error) {
      console.error("Failed to remove signal:", error);
      setIsRemoving(false);
    }
  };

  return (
    <AnimatePresence>
      {!isRemoving && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${display.bgColor} ${display.borderColor} ${display.textColor} ${display.hoverColor}`}
        >
          {/* Icon */}
          <div className="shrink-0 flex items-center">
            <IconComponent className={`size-3.5 ${display.iconColor}`} />
          </div>

          {/* Main content */}
          <div className={`flex flex-col gap-0.5 min-w-0 ${isRtl ? "text-right" : "text-left"}`}>
            <span className="text-[12px] font-medium leading-tight truncate">
              {display.mainText}
            </span>

            {/* Metadata row (severity, search volume, trend) */}
            {(display.severity || display.metadata) && (
              <span className="text-[10px] opacity-60 leading-tight">
                {display.severity || display.metadata}
              </span>
            )}
          </div>

          {/* Category badge for keywords */}
          {displayOptions.showCategory && display.category && (
            <div
              className={`ml-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${display.categoryColor?.bg} ${display.categoryColor?.text}`}
            >
              {display.category}
            </div>
          )}

          {/* Remove button */}
          {displayOptions.showRemoveButton && (
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className={`ml-1 p-1 rounded shrink-0 transition-all ${display.removeBtnColor} ${
                isRemoving ? "opacity-50 cursor-not-allowed" : "hover:scale-110 active:scale-95"
              }`}
              aria-label={isArabic ? "إزالة الإشارة" : "Remove signal"}
              title={isArabic ? "إزالة الإشارة" : "Remove signal"}
            >
              {isRemoving ? (
                <div className="size-3.5 animate-spin border-1 border-current border-t-transparent rounded-full" />
              ) : (
                <X className="size-3.5" />
              )}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const isArabic = false; // Will be set dynamically in component
