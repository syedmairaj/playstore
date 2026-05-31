"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, Info, Loader2, Sparkles, Star, TrendingUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Returns true when this queue item came from Market Intelligence Spotlight. */
function isSpotlightItem(item: ListingImprovementItem): boolean {
  return Boolean(item.sentimentTag?.startsWith("market_spotlight:"));
}

/** Human-readable label for a queue pill — strips internal prefixes. */
export function queueImprovementBadgeLabel(item: ListingImprovementItem): string {
  const tag = item.sentimentTag?.trim();
  // Strip market_spotlight: prefix so pill reads "fitness" not "market_spotlight:fitness"
  if (tag?.startsWith("market_spotlight:")) {
    return tag.replace(/^market_spotlight:/, "").trim() || "Market keyword";
  }
  if (tag) return tag;
  const text = item.reviewText?.trim() ?? "";
  if (text.length <= 20) return text || "Issue";
  return `${text.slice(0, 20)}…`;
}

/**
 * Converts an ISO 3166-1 alpha-2 country code to its emoji flag character.
 * e.g. "US" → "🇺🇸", "GB" → "🇬🇧"
 */
function getFlagEmoji(countryCode: string): string {
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0)),
  );
}

/** Filled star row — always renders 5 stars, highlights the first `score` in amber. */
function StarRow({ score }: { score: number }) {
  const clamped = Math.min(5, Math.max(0, Math.round(score)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${clamped} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3",
            i < clamped ? "fill-amber-400 text-amber-400" : "fill-zinc-700 text-zinc-700",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

/**
 * Spotlight tooltip — shown for Market Intelligence keyword pills.
 * Replaces the reviewer-info tooltip which is meaningless for synthetic items.
 */
function SpotlightPillTooltip({ item }: { item: ListingImprovementItem }) {
  const keyword = (item.sentimentTag ?? "").replace(/^market_spotlight:/, "").trim();
  return (
    <div className="space-y-2 text-start">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
        <TrendingUp className="size-3 shrink-0" aria-hidden />
        Market Intelligence · AI Keyword Spotlight
      </span>
      <p className="text-[11px] leading-relaxed text-zinc-300">
        <span className="font-semibold text-white/80">Trending keyword: </span>
        <span className="text-emerald-300">{keyword}</span>
      </p>
      <p className="text-[11px] leading-relaxed text-zinc-400">
        This keyword was identified as trending in your app's category by real-time analysis of
        the top 10 chart apps on Google Play. The AI will weave it semantically into your title,
        short description, and long description to improve discoverability.
      </p>
      <p className="text-[10px] text-zinc-600">
        Source: Market Intelligence → AI Keyword Spotlight
      </p>
    </div>
  );
}

/** Review-issue tooltip — shown for review-based pain-point pills. */
function ReviewPillTooltipContent({ item, ownPackageName, t }: { item: ListingImprovementItem; ownPackageName?: string | null; t: ReturnType<typeof useTranslations<"optimizer.activeQueue">> }) {
  const name = item.userName?.trim() || "Anonymous";
  const appLabel = item.packageName ?? item.appId ?? null;
  // country_code is not currently in the ListingImprovementItem schema but may be
  // added later — read it defensively so the flag renders automatically when present.
  const countryCode = (item as unknown as Record<string, unknown>)["country_code"];
  const flagEmoji =
    typeof countryCode === "string" && countryCode.length === 2
      ? getFlagEmoji(countryCode)
      : null;

  // Derive source classification using the workspace's own package name as ground truth.
  const isOwnApp = ownPackageName
    ? item.packageName?.trim() === ownPackageName.trim()
    : item.appId !== null && (item.packageName === null || item.packageName === item.appId);

  return (
    <div className="space-y-2 text-start">
      {/* Strategy badge */}
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold",
          isOwnApp
            ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25"
            : "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/25",
        )}
      >
        {isOwnApp ? t("infoTooltip.pillDefensive") : t("infoTooltip.pillOffensive")}
      </span>

      {/* Header: name • flag • app • stars */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-white/90">👤 {name}</span>
        {flagEmoji && typeof countryCode === "string" && (
          <>
            <span className="text-zinc-600">•</span>
            <span className="text-[11px] text-zinc-400">{flagEmoji} {countryCode.toUpperCase()}</span>
          </>
        )}
        {appLabel && (
          <>
            <span className="text-zinc-600">•</span>
            <span className="max-w-[120px] truncate font-mono text-[10px] text-zinc-500">📍 {appLabel}</span>
          </>
        )}
        {item.score > 0 && (
          <>
            <span className="text-zinc-600">•</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-400">
              <StarRow score={item.score} />
              <span className="ms-1 font-semibold">{item.score}</span>
              <span className="text-zinc-500"> Stars</span>
            </span>
          </>
        )}
      </div>
      {item.reviewText?.trim() && (
        <p className="text-[11px] italic leading-relaxed text-zinc-400">
          &ldquo;{item.reviewText.trim().slice(0, 240)}{item.reviewText.trim().length > 240 ? "…" : ""}&rdquo;
        </p>
      )}
    </div>
  );
}

/** Routes to the correct tooltip based on item source. */
function PillTooltipContent({ item, ownPackageName, t }: { item: ListingImprovementItem; ownPackageName?: string | null; t: ReturnType<typeof useTranslations<"optimizer.activeQueue">> }) {
  if (isSpotlightItem(item)) {
    return <SpotlightPillTooltip item={item} />;
  }
  return <ReviewPillTooltipContent item={item} ownPackageName={ownPackageName} t={t} />;
}

export type ActiveOptimizationQueuePanelProps = {
  items: ListingImprovementItem[];
  loading?: boolean;
  className?: string;
  /**
   * Called when the user clicks the delete (×) button on a pill.
   * The parent should remove the item from state and call the DELETE API.
   */
  onRemoveItem?: (itemId: string) => void;
  /**
   * The workspace app's own package name (e.g. "com.myapp.android").
   * Used as ground truth to classify pills as defensive (own app) vs offensive (competitor).
   * Without this, classification falls back to the less reliable appId heuristic.
   */
  ownPackageName?: string | null;
  /**
   * When true, the queue is locked in "Processing…" mode — all pills are dimmed
   * and the delete button is hidden. Use this while the Gemini generation is running
   * to prevent the user from modifying the queue mid-flight (which can cause
   * state duplication bugs).
   */
  isGenerating?: boolean;
  /**
   * Optional callback wired up by the parent to navigate the user to the Reviews tab.
   * When provided, the empty state shows a "Go to Reviews" CTA button.
   */
  onNavigateToReviews?: () => void;
};

export function ActiveOptimizationQueuePanel({
  items,
  loading = false,
  className,
  onRemoveItem,
  ownPackageName,
  isGenerating = false,
  onNavigateToReviews,
}: ActiveOptimizationQueuePanelProps) {
  const t = useTranslations("optimizer.activeQueue");

  // Track which item IDs are mid-delete for visual feedback
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  function handleRemove(itemId: string) {
    if (!onRemoveItem || deletingIds.has(itemId)) return;
    setDeletingIds((prev) => new Set(prev).add(itemId));
    // Optimistic removal is handled by the parent; we just signal
    onRemoveItem(itemId);
    // Clear loading indicator after a tick (parent state update clears the pill entirely)
    setTimeout(() => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }, 600);
  }

  // ── Generating state ─────────────────────────────────────────────────────────
  // The Sonner toast already communicates "generation in progress".
  // No items → hide the panel entirely (no card, no empty state text).
  // Has items → collapse to a minimal strip so the user sees what's being used,
  // without the full bordered card competing visually with the toast.
  if (isGenerating && items.length === 0) {
    return null;
  }

  if (isGenerating && items.length > 0) {
    return (
      <motion.div
        layout
        className={cn("mb-2", className)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="mb-2 flex items-center gap-1.5 text-xs text-zinc-500">
          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
          <span>{t("processingBanner")}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 pointer-events-none">
          {items.map((item) => (
            <span
              key={item.id}
              className={cn(
                "inline-flex cursor-default items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
                isSpotlightItem(item)
                  ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-500/70"
                  : "border-zinc-700/50 bg-zinc-800/40 text-zinc-500",
              )}
            >
              <CheckCircle2 className="size-3 shrink-0 text-zinc-600" aria-hidden />
              {queueImprovementBadgeLabel(item)}
            </span>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
        layout
        className={cn(
          "mb-6 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950 shadow-lg shadow-black/30",
          className,
        )}
      >
        {/* Header */}
        <div className="border-b border-slate-800/70 bg-slate-900/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-slate-100">
              {t("title")}
            </h3>
            {/* Educational info icon — explains what the queue does and why */}
            <TooltipProvider>
              <Tooltip
                side="right"
                className="max-w-sm"
                asChild
                content={
                  <div className="space-y-3 text-start">
                    <p className="text-[12px] font-semibold text-white/90">
                      {t("infoTooltip.heading")}
                    </p>
                    <div className="space-y-2.5">
                      {/* WHAT IT IS */}
                      <p className="text-[11px] leading-relaxed text-zinc-300">
                        <span className="font-semibold text-white/80">
                          {t("infoTooltip.whatItIsLabel")}
                        </span>{" "}
                        {t("infoTooltip.whatItIsBody")}
                      </p>
                      {/* DEFENSIVE VS. OFFENSIVE */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-white/80">
                          {t("infoTooltip.strategyLabel")}
                        </p>
                        <p className="text-[11px] leading-relaxed text-zinc-300">
                          <span className="font-semibold text-sky-400">
                            {t("infoTooltip.strategyOwnLabel")}
                          </span>{" "}
                          {t("infoTooltip.strategyOwnBody")}
                        </p>
                        <p className="text-[11px] leading-relaxed text-zinc-300">
                          <span className="font-semibold text-orange-400">
                            {t("infoTooltip.strategyCompetitorLabel")}
                          </span>{" "}
                          {t("infoTooltip.strategyCompetitorBody")}
                        </p>
                      </div>
                      {/* EXPECTED RESULT */}
                      <p className="text-[11px] leading-relaxed text-zinc-300">
                        <span className="font-semibold text-white/80">
                          {t("infoTooltip.expectedResultLabel")}
                        </span>{" "}
                        {t("infoTooltip.expectedResultBody")}
                      </p>
                    </div>
                  </div>
                }
              >
                <span
                  role="img"
                  aria-label={t("infoTooltip.ariaLabel")}
                  tabIndex={0}
                  className="flex shrink-0 cursor-default items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <Info className="size-3.5" aria-hidden />
                </span>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {t("subtext")}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <motion.div
              className="flex items-center gap-2 text-xs text-slate-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("loading")}
            </motion.div>
          ) : items.length > 0 ? (
            <TooltipProvider>
              <motion.div
                layout
                className="flex flex-wrap gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence initial={false}>
                  {items.map((item) => {
                    const isDeleting = deletingIds.has(item.id);
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: isDeleting ? 0.4 : 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                      >
                        <Tooltip
                          side="top"
                          className="max-w-[300px]"
                          content={<PillTooltipContent item={item} ownPackageName={ownPackageName} t={t} />}
                          asChild
                        >
                          <span
                            tabIndex={0}
                            className={cn(
                              "group inline-flex cursor-default items-center gap-1.5 rounded-lg ps-3 pe-1.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                              isSpotlightItem(item)
                                // Emerald tint — Market Intelligence keyword
                                ? "border border-emerald-500/30 bg-emerald-900/20 text-emerald-200 ring-emerald-700/30 hover:border-emerald-500/50 hover:bg-emerald-900/30"
                                // Default slate — review-based issue
                                : "border border-rose-500/20 bg-slate-800/70 text-slate-200 ring-slate-700/40 hover:border-rose-500/30 hover:bg-slate-800",
                            )}
                          >
                            {isSpotlightItem(item) ? (
                              <Sparkles className="size-3 shrink-0 text-emerald-400" aria-hidden />
                            ) : (
                              <CheckCircle2 className="size-3 shrink-0 text-rose-400" aria-hidden />
                            )}
                            {queueImprovementBadgeLabel(item)}

                            {onRemoveItem && (
                              <button
                                type="button"
                                disabled={isDeleting}
                                aria-label={t("pillRemoveAriaLabel")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemove(item.id);
                                }}
                                className={cn(
                                  "ms-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                                  "text-slate-600 transition-colors",
                                  "hover:bg-rose-500/20 hover:text-rose-400",
                                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/50",
                                  isDeleting && "pointer-events-none",
                                )}
                              >
                                {isDeleting ? (
                                  <Loader2 className="size-2.5 animate-spin" aria-hidden />
                                ) : (
                                  <X className="size-2.5" aria-hidden />
                                )}
                              </button>
                            )}
                          </span>
                        </Tooltip>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </TooltipProvider>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-slate-500">{t("emptyTip")}</p>
              {onNavigateToReviews ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={onNavigateToReviews}
                    className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60"
                  >
                    {t("emptyCtaLabel")}
                    <ArrowRight className="size-3 shrink-0" aria-hidden />
                  </button>
                  <p className="text-[11px] leading-relaxed text-slate-600">{t("emptyCtaHint")}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

      </motion.div>
  );
}
