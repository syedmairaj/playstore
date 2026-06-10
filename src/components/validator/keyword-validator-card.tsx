/**
 * Keyword Validator Card Component
 *
 * Displays keyword viability analysis with confidence metrics.
 * Part of the Quick Win Keyword Validator feature.
 *
 * Features:
 * - Real-time keyword validation
 * - Difficulty slider visualization
 * - Monthly installs projection (3 scenarios)
 * - Confidence score indicator
 * - Recommendation badge
 * - Keyword tags
 * - Copy to clipboard action
 * - Bilingual support (EN/AR)
 *
 * Usage:
 * <KeywordValidatorCard
 *   keyword={viabilityScore}
 *   locale="en"
 *   isRtl={false}
 *   onSelect={(keyword) => handleSelect(keyword)}
 * />
 */

"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, ChevronRight, AlertCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KeywordViabilityScore {
  keyword: string;
  language: "en" | "ar";
  difficulty: {
    difficulty: number;
    searchVolume: number;
    competition: number;
    confidenceScore: number;
  };
  monthlyInstalls: {
    low: number;
    medium: number;
    high: number;
  };
  recommendation: "high_confidence" | "medium_opportunity" | "skip_this";
  reasoning: string;
  confidence: number;
  tags: string[];
}

export interface KeywordValidatorCardProps {
  keyword: KeywordViabilityScore;
  locale: string;
  isRtl?: boolean;
  onSelect?: (keyword: string) => void;
  isLoading?: boolean;
}

const RECOMMENDATION_CONFIG = {
  high_confidence: {
    label: "High Confidence",
    labelAr: "ثقة عالية",
    color: "from-green-500 to-emerald-600",
    textColor: "text-green-100",
    bgColor: "bg-green-900/20",
    borderColor: "border-green-500/30",
    icon: "✅",
  },
  medium_opportunity: {
    label: "Medium Opportunity",
    labelAr: "فرصة متوسطة",
    color: "from-amber-500 to-orange-600",
    textColor: "text-amber-100",
    bgColor: "bg-amber-900/20",
    borderColor: "border-amber-500/30",
    icon: "⚡",
  },
  skip_this: {
    label: "Skip This",
    labelAr: "تجاوز هذا",
    color: "from-red-500 to-rose-600",
    textColor: "text-red-100",
    bgColor: "bg-red-900/20",
    borderColor: "border-red-500/30",
    icon: "⊘",
  },
};

/**
 * Get recommendation label for locale
 */
function getRecommendationLabel(recommendation: string, locale: string): string {
  const config = RECOMMENDATION_CONFIG[recommendation as keyof typeof RECOMMENDATION_CONFIG];
  return locale === "ar" ? config.labelAr : config.label;
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

/**
 * Keyword Validator Card Component
 */
export function KeywordValidatorCard({
  keyword,
  locale,
  isRtl = false,
  onSelect,
  isLoading = false,
}: KeywordValidatorCardProps) {
  const [copied, setCopied] = useState(false);

  const config = RECOMMENDATION_CONFIG[
    keyword.recommendation as keyof typeof RECOMMENDATION_CONFIG
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(keyword.keyword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelect = () => {
    onSelect?.(keyword.keyword);
  };

  const difficultyLevel =
    keyword.difficulty.difficulty <= 3
      ? locale === "ar"
        ? "سهل"
        : "Easy"
      : keyword.difficulty.difficulty <= 6
        ? locale === "ar"
          ? "متوسط"
          : "Moderate"
        : locale === "ar"
          ? "صعب"
          : "Challenging";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-xl border backdrop-blur-sm",
        config.bgColor,
        config.borderColor,
        "p-4 space-y-4",
        isRtl && "text-right"
      )}
    >
      {/* Header: Keyword + Recommendation Badge */}
      <div className={cn("flex items-start justify-between gap-3", isRtl && "flex-row-reverse")}>
        <div className="flex-1 min-w-0">
          {/* Keyword */}
          <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
            <h3 className="text-base font-semibold text-white truncate">{keyword.keyword}</h3>
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Copy keyword"
              aria-label="Copy keyword"
            >
              {copied ? (
                <Check className="size-4 text-green-400" />
              ) : (
                <Copy className="size-4 text-zinc-400" />
              )}
            </button>
          </div>

          {/* Reasoning */}
          <p className="text-[11px] text-zinc-300 mt-1 line-clamp-2">{keyword.reasoning}</p>
        </div>

        {/* Recommendation Badge */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className={cn(
            "whitespace-nowrap px-2.5 py-1 rounded-lg",
            `bg-gradient-to-r ${config.color}`,
            config.textColor,
            "text-[10px] font-bold"
          )}
        >
          {getRecommendationLabel(keyword.recommendation, locale)}
        </motion.div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Difficulty */}
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5">
            {locale === "ar" ? "الصعوبة" : "Difficulty"}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(keyword.difficulty.difficulty / 10) * 100}%` }}
                transition={{ duration: 0.6 }}
                className={cn(
                  "h-full rounded-full",
                  keyword.difficulty.difficulty <= 3
                    ? "bg-emerald-500"
                    : keyword.difficulty.difficulty <= 6
                      ? "bg-amber-500"
                      : "bg-red-500"
                )}
              />
            </div>
            <span className="text-sm font-semibold text-white min-w-6">
              {keyword.difficulty.difficulty.toFixed(1)}
            </span>
          </div>
          <div className="text-[9px] text-zinc-500 mt-1">{difficultyLevel}</div>
        </div>

        {/* Confidence */}
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5">
            {locale === "ar" ? "الثقة" : "Confidence"}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${keyword.confidence}%` }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="h-full bg-blue-500 rounded-full"
              />
            </div>
            <span className="text-sm font-semibold text-white min-w-6">
              {keyword.confidence}%
            </span>
          </div>
        </div>

        {/* Search Volume */}
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
            {locale === "ar" ? "البحث" : "Search Vol."}
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            {formatNumber(keyword.difficulty.searchVolume)}
          </div>
        </div>

        {/* Competition */}
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
            {locale === "ar" ? "المنافسة" : "Competition"}
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            {keyword.difficulty.competition.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Monthly Installs Projection */}
      <div className="bg-white/5 rounded-lg p-3 space-y-2">
        <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
          <TrendingUp className="size-4 text-cyan-400" />
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
            {locale === "ar" ? "التثبيتات المتوقعة" : "Est. Monthly Installs"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="text-center">
            <div className="text-zinc-400">{locale === "ar" ? "متحفظ" : "Low"}</div>
            <div className="text-sm font-semibold text-amber-300 mt-0.5">
              {formatNumber(keyword.monthlyInstalls.low)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-zinc-400">{locale === "ar" ? "واقعي" : "Realistic"}</div>
            <div className="text-sm font-semibold text-green-300 mt-0.5">
              {formatNumber(keyword.monthlyInstalls.medium)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-zinc-400">{locale === "ar" ? "متفائل" : "High"}</div>
            <div className="text-sm font-semibold text-blue-300 mt-0.5">
              {formatNumber(keyword.monthlyInstalls.high)}
            </div>
          </div>
        </div>

        <div className={cn(
          "flex items-start gap-2 p-2 rounded bg-black/20",
          isRtl && "flex-row-reverse"
        )}>
          <AlertCircle className="size-3 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p className="text-[9px] text-zinc-400">
            {locale === "ar"
              ? "قيم محتملة بناءً على تحليل السوق. يختلف الأداء الفعلي حسب جودة القائمة."
              : "Estimated potential based on market analysis. Actual results vary with listing quality."}
          </p>
        </div>
      </div>

      {/* Tags */}
      {keyword.tags.length > 0 && (
        <div className={cn("flex flex-wrap gap-1.5", isRtl && "justify-end")}>
          {keyword.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded bg-white/10 text-[9px] text-zinc-300 border border-white/5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action Button */}
      {onSelect && (
        <motion.button
          whileHover={{ x: isRtl ? -2 : 2 }}
          onClick={handleSelect}
          disabled={isLoading}
          className={cn(
            "w-full py-2 rounded-lg font-semibold text-[12px]",
            "flex items-center justify-center gap-2",
            isRtl && "flex-row-reverse",
            "transition-all duration-200",
            keyword.recommendation === "high_confidence"
              ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/50"
              : keyword.recommendation === "medium_opportunity"
                ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-lg hover:shadow-amber-500/50"
                : "bg-white/5 text-zinc-300 hover:bg-white/10",
            isLoading && "opacity-50 pointer-events-none"
          )}
        >
          <span>
            {locale === "ar" ? "أضف الكلمة المفتاحية" : "Add Keyword"}
          </span>
          <ChevronRight className="size-4" />
        </motion.button>
      )}
    </motion.div>
  );
}

export default KeywordValidatorCard;
