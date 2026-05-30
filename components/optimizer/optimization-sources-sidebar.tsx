"use client";

import { AlertTriangle, Hash, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";

/**
 * OptimizationSourcesSidebar
 *
 * Shows a compact "what the AI will use" pill list in Step 3 of the Listing
 * Optimizer — directly above the Generate button.
 *
 * • [!] pills — review-based pain-point targets (backlog items or review improvements)
 * • [#] pills — market spotlight keyword signals (prefixed `market_spotlight:`)
 *
 * This turns the "black box" AI into a transparent consultant: the user sees
 * exactly WHY the generated listing will contain the copy it contains.
 */

type Props = {
  items: ListingImprovementItem[];
  isRtl?: boolean;
};

/** Strips the `market_spotlight:` prefix from items that came from Market Intel. */
function isMarketSpotlightItem(item: ListingImprovementItem): boolean {
  return (
    item.id.startsWith("url-exploit-") &&
    item.sentimentTag?.startsWith("market_spotlight:")
  );
}

function getSpotlightLabel(item: ListingImprovementItem): string {
  return item.sentimentTag.replace(/^market_spotlight:/, "").trim();
}

function getIssueLabel(item: ListingImprovementItem): string {
  const tag = item.sentimentTag?.trim();
  if (tag && !tag.startsWith("market_spotlight:")) return tag;
  const text = item.reviewText?.trim().slice(0, 40);
  return text || "Issue";
}

export function OptimizationSourcesSidebar({ items, isRtl = false }: Props) {
  if (!items.length) return null;

  const issueItems = items.filter((i) => !isMarketSpotlightItem(i));
  const spotlightItems = items.filter((i) => isMarketSpotlightItem(i));

  // Nothing to show if no categorisable items
  if (!issueItems.length && !spotlightItems.length) return null;

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "rounded-2xl border border-zinc-800/80 bg-white/[0.02] p-4",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
      )}
    >
      <p className={cn(
        "mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500",
        isRtl && "text-end font-arabic",
      )}>
        {isRtl ? "مصادر التحسين النشطة" : "Active optimization inputs"}
      </p>

      <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
        {/* Review issue pills — [!] */}
        {issueItems.map((item) => (
          <span
            key={item.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2 py-1 text-[11px] font-medium text-rose-300/90",
              isRtl && "flex-row-reverse font-arabic",
            )}
            title={item.reviewText?.slice(0, 200)}
          >
            <AlertTriangle className="size-3 shrink-0 text-rose-400" aria-hidden />
            {getIssueLabel(item)}
          </span>
        ))}

        {/* Market spotlight keyword pills — [#] */}
        {spotlightItems.map((item) => (
          <span
            key={item.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-1 text-[11px] font-medium text-emerald-300/90",
              isRtl && "flex-row-reverse",
            )}
            title="Trending keyword from Market Intelligence spotlight"
          >
            <Hash className="size-3 shrink-0 text-emerald-400" aria-hidden />
            {getSpotlightLabel(item)}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1", isRtl && "flex-row-reverse")}>
        {issueItems.length > 0 && (
          <p className={cn("flex items-center gap-1 text-[10px] text-zinc-600", isRtl && "flex-row-reverse font-arabic")}>
            <AlertTriangle className="size-2.5 text-rose-500/60" aria-hidden />
            {isRtl ? "مشكلة مُراجَعة سيتم إصلاحها" : "Review issue — will be addressed in listing"}
          </p>
        )}
        {spotlightItems.length > 0 && (
          <p className={cn("flex items-center gap-1 text-[10px] text-zinc-600", isRtl && "flex-row-reverse")}>
            <Sparkles className="size-2.5 text-emerald-500/60" aria-hidden />
            {isRtl ? "كلمة من ذكاء السوق ستُنسج في النص" : "Market keyword — will be woven into copy"}
          </p>
        )}
      </div>
    </div>
  );
}
