"use client";

import { Eye, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PreviewHiddenBarProps = {
  term: string;
  marketCount: number;
  creditsUsed: number;
  promotePending: boolean;
  canPromote: boolean;
  onShowPreview: () => void;
  onPromote: () => void;
  isRtl?: boolean;
};

/** Collapsed state after hide — paid preview data remains in session/draft. */
export function PreviewHiddenBar({
  term,
  marketCount,
  creditsUsed,
  promotePending,
  canPromote,
  onShowPreview,
  onPromote,
  isRtl = false,
}: PreviewHiddenBarProps) {
  const t = useTranslations("keywordTracker.previewHidden");

  return (
    <div
      className="rounded-xl border border-amber-500/25 bg-amber-950/25 px-4 py-3 ring-1 ring-amber-500/15"
      role="status"
    >
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          isRtl && "sm:flex-row-reverse",
        )}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-amber-100/95">
            {t("title", { term: term.trim() || "—" })}
          </p>
          <p className="text-xs leading-relaxed text-amber-200/70">
            {t("subtitle", { markets: marketCount, credits: creditsUsed })}
          </p>
        </div>
        <div className={cn("flex flex-wrap gap-2", isRtl && "flex-row-reverse")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
            onClick={onShowPreview}
          >
            <Eye className="me-1.5 size-4 shrink-0" aria-hidden />
            {t("showAgain")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            disabled={promotePending || !canPromote}
            onClick={onPromote}
          >
            {promotePending ? (
              <Loader2 className="me-1.5 size-4 shrink-0 animate-spin" aria-hidden />
            ) : null}
            {promotePending ? t("promoting") : t("addToWatchlist")}
          </Button>
        </div>
      </div>
    </div>
  );
}
