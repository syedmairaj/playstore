"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PreviewPromotePanelProps = {
  term: string;
  /** Keyword already on the watchlist (or just promoted from this preview). */
  isOnWatchlist: boolean;
  promotePending: boolean;
  canPromote: boolean;
  needsPackageMessage?: string | null;
  creditsUsed?: number;
  onPromote: () => void;
  onAdjustMarkets: () => void;
  onRequestDismiss: () => void;
  isRtl?: boolean;
};

/**
 * Sticky action bar for the live preview lifecycle: explore → promote → tracked.
 * Sits above Serper results so promote/save actions stay visible while scrolling.
 */
export function PreviewPromotePanel({
  term,
  isOnWatchlist,
  promotePending,
  canPromote,
  needsPackageMessage,
  creditsUsed = 0,
  onPromote,
  onAdjustMarkets,
  onRequestDismiss,
  isRtl = false,
}: PreviewPromotePanelProps) {
  const t = useTranslations("keywordTracker.serper");
  const trimmed = term.trim();

  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-1 rounded-xl border border-white/[0.1] bg-[#0a0e14]/95 px-4 py-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.65)] backdrop-blur-md ring-1 ring-white/[0.05]",
        isOnWatchlist
          ? "border-emerald-500/30 bg-emerald-950/40"
          : "border-amber-500/25 bg-amber-950/20",
      )}
      role="region"
      aria-label={t("previewPanelAria")}
    >
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          isRtl && "sm:flex-row-reverse",
        )}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {isOnWatchlist ? t("previewStateTracked") : t("previewStateExploratory")}
          </p>
          <p className="text-sm font-medium text-zinc-100">
            {isOnWatchlist
              ? t("promotedBanner", { term: trimmed || "—" })
              : t("previewExploratoryHint", { term: trimmed || "—" })}
          </p>
          {!isOnWatchlist ? (
            <>
              {creditsUsed > 0 ? (
                <p className="text-xs leading-relaxed text-amber-200/80">
                  {t("creditsAlreadySpent", { credits: creditsUsed })}
                </p>
              ) : null}
              <p className="text-xs leading-relaxed text-zinc-500">{t("promoteNoExtraCredits")}</p>
            </>
          ) : null}
          {needsPackageMessage ? (
            <p className="text-xs text-amber-200/90">{needsPackageMessage}</p>
          ) : null}
        </div>

        <TooltipProvider>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              isRtl && "flex-row-reverse",
            )}
          >
            {isOnWatchlist ? (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 text-sm font-medium text-emerald-100">
                <Check className="size-4 shrink-0" aria-hidden />
                {t("onWatchlistBadge")}
              </span>
            ) : (
              <Tooltip
                content={
                  <span className="block max-w-[260px] leading-snug text-zinc-200">
                    {t("addToWatchlistTooltip")}
                  </span>
                }
                side="top"
                className="max-w-[280px] border border-white/[0.12] bg-[#0a0d12] px-3 py-2 text-xs"
                asChild
              >
                <Button
                  type="button"
                  className="h-10 shrink-0 bg-emerald-500 px-4 text-emerald-950 hover:bg-emerald-400"
                  disabled={promotePending || !canPromote}
                  onClick={onPromote}
                >
                  {promotePending ? (
                    <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
                  ) : null}
                  {promotePending ? t("savePending") : t("addToWatchlist")}
                </Button>
              </Tooltip>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 border-white/15 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
              disabled={promotePending}
              onClick={onAdjustMarkets}
            >
              {t("adjustMarkets")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 border-rose-500/25 bg-transparent text-rose-200/90 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100"
              disabled={promotePending}
              onClick={onRequestDismiss}
            >
              {t("hidePreview")}
            </Button>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
