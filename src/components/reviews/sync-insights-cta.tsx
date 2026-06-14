"use client";

import { RefreshCw, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SyncInsightsCtaProps = {
  isRtl?: boolean;
  disabled?: boolean;
  isSyncLoading?: boolean;
  isAnalyzing?: boolean;
  hasReviews: boolean;
  rawReviewCount: number;
  creditCost: number;
  monthlyUsed: number;
  monthlyLimit: number;
  creditsRemaining: number | null;
  onSyncInsights: () => void;
  onReAnalyze?: () => void;
  showReAnalyze?: boolean;
  variant?: "primary" | "compact";
};

export function SyncInsightsCta({
  isRtl = false,
  disabled = false,
  isSyncLoading = false,
  isAnalyzing = false,
  hasReviews,
  rawReviewCount,
  creditCost,
  monthlyUsed,
  monthlyLimit,
  creditsRemaining,
  onSyncInsights,
  onReAnalyze,
  showReAnalyze = false,
  variant = "primary",
}: SyncInsightsCtaProps) {
  const t = useTranslations("reviews.syncInsights");

  const monthlyLimitReached = monthlyUsed >= monthlyLimit;
  const syncComplete = !isSyncLoading;
  const noReviewsLabel = syncComplete
    ? t("noReviewsInMarket")
    : t("waitingForReviews");

  const usageLabel = t("usageTracker", {
    used: monthlyUsed,
    limit: monthlyLimit,
  });

  const creditLabel = t("creditCost", { credits: creditCost });

  const syncDisabled =
    disabled || isAnalyzing || !hasReviews || monthlyLimitReached;

  if (variant === "compact" && showReAnalyze) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", isRtl && "flex-row-reverse")}>
        <span
          className={cn(
            "text-[11px] font-medium",
            monthlyLimitReached ? "text-amber-400/90" : "text-zinc-500",
          )}
        >
          {usageLabel}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={syncDisabled}
          className="border-white/15 text-zinc-200 hover:bg-white/[0.06]"
          onClick={() => onReAnalyze?.()}
        >
          <RefreshCw className={cn("size-3.5", isAnalyzing && "animate-spin")} aria-hidden />
          {monthlyLimitReached ? t("limitReachedShort") : t("reAnalyze", { credits: creditCost })}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]",
        monthlyLimitReached
          ? "border-amber-500/25 bg-gradient-to-br from-amber-950/25 via-[#0a0e14] to-[#070a0f]"
          : "border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-[#0a0e14] to-[#070a0f]",
        isRtl && "font-arabic",
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-emerald-500/8 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4">
        <div className={cn("flex items-start gap-3", isRtl && "flex-row-reverse")}>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border",
              monthlyLimitReached
                ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
            )}
          >
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div className={cn("min-w-0 space-y-1", isRtl ? "text-right" : "text-left")}>
            <p className="text-sm font-semibold text-white">{t("title")}</p>
            <p className="max-w-lg text-xs leading-relaxed text-zinc-400">
              {monthlyLimitReached ? t("limitReachedBody") : t("subtitle")}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-2 text-[11px]",
            isRtl && "flex-row-reverse",
          )}
        >
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 font-medium",
              monthlyLimitReached
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-white/10 bg-white/[0.04] text-zinc-400",
            )}
          >
            {usageLabel}
          </span>
          {!monthlyLimitReached ? (
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-300/90">
              {creditLabel}
            </span>
          ) : null}
          {creditsRemaining != null ? (
            <span className="text-zinc-600">
              {t("balance", { count: creditsRemaining })}
            </span>
          ) : null}
        </div>

        {monthlyLimitReached ? (
          <p className="text-[11px] leading-relaxed text-amber-300/85">{t("limitReachedHint")}</p>
        ) : null}

        {hasReviews && rawReviewCount > 0 && !monthlyLimitReached ? (
          <p className="text-[11px] font-medium text-emerald-300/85">
            {t("reviewsReady", { count: rawReviewCount })}
          </p>
        ) : null}

        <div className={cn("flex justify-end", isRtl && "justify-start")}>
          <Button
            type="button"
            size="sm"
            disabled={syncDisabled}
            className={cn(
              "text-white focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50",
              monthlyLimitReached
                ? "bg-amber-600/80 hover:bg-amber-600"
                : "bg-emerald-600 hover:bg-emerald-500",
            )}
            onClick={onSyncInsights}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="me-1.5 size-3.5 animate-spin" aria-hidden />
                {t("syncing")}
              </>
            ) : (
              <>
                <Zap className="me-1.5 size-3.5" aria-hidden />
                {monthlyLimitReached
                  ? t("limitReachedShort")
                  : hasReviews
                    ? t("cta", { credits: creditCost })
                    : noReviewsLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
