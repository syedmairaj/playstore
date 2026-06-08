"use client";

import { AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";

/**
 * OptimizationSourcesSidebar
 *
 * Shows a compact "what the AI will use" pill list in Step 3 of the Listing
 * Optimizer — directly above the Generate button.
 *
 * • Rose [!] pills  — review-based pain-point targets (backlog issues)
 * • Emerald [✦] pills — market spotlight keyword signals (market_spotlight: prefix)
 *
 * This turns the "black box" AI into a transparent consultant: the user sees
 * exactly WHY the generated listing will contain the copy it contains.
 */

type Props = {
  items: ListingImprovementItem[];
  isRtl?: boolean;
};

/** True when this queue item came from Market Intelligence Spotlight. */
function isMarketSpotlightItem(item: ListingImprovementItem): boolean {
  return Boolean(item.sentimentTag?.startsWith("market_spotlight:"));
}

/** Human-readable keyword label — strips the internal prefix. */
function getSpotlightLabel(item: ListingImprovementItem): string {
  return (item.sentimentTag ?? "").replace(/^market_spotlight:/, "").trim() || "Market keyword";
}

/**
 * Human-readable label for a review issue pill.
 * Priority: sentimentTag (stripped) → reviewText → "Issue"
 * Never exposes raw internal prefixes.
 */
function getIssueLabel(item: ListingImprovementItem): string {
  const tag = item.sentimentTag?.trim();
  // If sentimentTag exists and isn't an internal prefix, use it
  if (tag && !tag.startsWith("market_spotlight:")) {
    return tag.length > 40 ? `${tag.slice(0, 40)}…` : tag;
  }
  // Fall back to reviewText (which for backlog items stores the issue title)
  const text = item.reviewText?.trim();
  if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return "Issue";
}

export function OptimizationSourcesSidebar({ items, isRtl = false }: Props) {
  if (!items.length) return null;

  const issueItems = items.filter((i) => !isMarketSpotlightItem(i));
  const spotlightItems = items.filter((i) => isMarketSpotlightItem(i));

  if (!issueItems.length && !spotlightItems.length) return null;

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "rounded-2xl border border-zinc-800/80 bg-white/[0.02] p-4",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
      )}
    >
      {/* Header */}
      <p className={cn(
        "mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500",
        isRtl && "text-end font-arabic",
      )}>
        {isRtl ? "مصادر التحسين النشطة" : "Active optimization inputs"}
      </p>

      <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
        {/* Review issue pills — rose */}
        {issueItems.map((item) => (
          <span
            key={item.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-rose-300/90",
              isRtl && "flex-row-reverse font-arabic",
            )}
            title={
              isRtl
                ? `مشكلة مُراجَعة: ${item.reviewText?.slice(0, 200) ?? ""}`
                : `Review issue: "${item.reviewText?.slice(0, 200) ?? ""}" — AI will address this in the listing`
            }
          >
            <AlertTriangle className="size-3 shrink-0 text-rose-400" aria-hidden />
            {getIssueLabel(item)}
          </span>
        ))}

        {/* Market spotlight keyword pills — emerald */}
        {spotlightItems.map((item) => (
          <span
            key={item.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-300/90",
              isRtl && "flex-row-reverse",
            )}
            title={
              isRtl
                ? `كلمة رائجة من ذكاء السوق: ${getSpotlightLabel(item)} — ستُنسج في العنوان والوصف`
                : `Market Intelligence spotlight keyword: "${getSpotlightLabel(item)}" — AI will weave this into your title, short & long description`
            }
          >
            <TrendingUp className="size-3 shrink-0 text-emerald-400" aria-hidden />
            {getSpotlightLabel(item)}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1", isRtl && "flex-row-reverse")}>
        {issueItems.length > 0 && (
          <p className={cn("flex items-center gap-1 text-[10px] text-zinc-600", isRtl && "flex-row-reverse font-arabic")}>
            <AlertTriangle className="size-2.5 text-rose-500/60" aria-hidden />
            {isRtl ? "مشكلة مُراجَعة سيتم إصلاحها في القائمة" : "Review issue — will be fixed & addressed in listing"}
          </p>
        )}
        {spotlightItems.length > 0 && (
          <p className={cn("flex items-center gap-1 text-[10px] text-zinc-600", isRtl && "flex-row-reverse")}>
            <Sparkles className="size-2.5 text-emerald-500/60" aria-hidden />
            {isRtl ? "كلمة مفتاحية رائجة من ذكاء السوق ستُنسج في النص" : "Market Intelligence keyword — trending in your category, woven into copy"}
          </p>
        )}
      </div>
    </div>
  );
}
