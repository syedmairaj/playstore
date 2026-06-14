"use client";

import { Check, Lock, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ReviewAnalysisStatus } from "@/lib/review-insights/credit-gate";
import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES = {
  CRITICAL: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  LOW: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400",
} as const;

const CATEGORY_STYLES = {
  UX: "border-indigo-500/25 bg-indigo-500/10 text-indigo-200",
  CRASHES: "border-rose-500/25 bg-rose-500/10 text-rose-200",
  ACCURACY: "border-cyan-500/25 bg-cyan-500/10 text-cyan-200",
  PERFORMANCE: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  PRICING: "border-violet-500/25 bg-violet-500/10 text-violet-200",
  FEATURES: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
} as const;

export type ReviewInsightsPanelProps = {
  pendingInsights: PendingReviewInsight[];
  adoptedInsights: PendingReviewInsight[];
  workspaceId: string;
  isRtl?: boolean;
  loading?: boolean;
  analysisStatus: ReviewAnalysisStatus;
  gateValid: boolean;
  adoptingId?: string | null;
  onDismiss: (insightId: string) => void;
  onAdopt: (insight: PendingReviewInsight) => void;
};

export function ReviewInsightsPanel({
  pendingInsights,
  adoptedInsights,
  workspaceId,
  isRtl = false,
  loading = false,
  analysisStatus,
  gateValid,
  adoptingId = null,
  onDismiss,
  onAdopt,
}: ReviewInsightsPanelProps) {
  const t = useTranslations("optimizer.reviewInsights");
  const adoptEnabled = gateValid && analysisStatus === "SUCCESS_PAID";
  const cards = [...pendingInsights, ...adoptedInsights];

  if (!gateValid || analysisStatus !== "SUCCESS_PAID") {
    return (
      <div
        className={cn(
          "rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-[#0a0e14] to-[#070a0f] px-5 py-10 text-center",
          isRtl && "font-arabic",
        )}
      >
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
          <Lock className="size-5" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-white">{t("lockedTitle")}</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
          {t("lockedHint")}
        </p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-amber-400/80">
          {t("lockedStatus", { status: analysisStatus })}
        </p>
        <Link
          href={`/app/${workspaceId}/reviews`}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          <Sparkles className="size-3.5" aria-hidden />
          {t("lockedCta")}
        </Link>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center",
          isRtl && "font-arabic",
        )}
      >
        <Sparkles className="mx-auto mb-3 size-5 text-zinc-600" aria-hidden />
        <p className="text-sm font-medium text-zinc-400">{t("emptyTitle")}</p>
        <p className="mt-1 text-xs text-zinc-600">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", isRtl && "font-arabic")}>
      <div className={cn("flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
        <div className={cn("space-y-0.5", isRtl ? "text-right" : "text-left")}>
          <h3 className="text-sm font-semibold text-white">{t("title")}</h3>
          <p className="text-[11px] text-zinc-500">{t("curationSubtitle")}</p>
        </div>
        <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300/90">
          {t("pendingBadge", { count: pendingInsights.length })}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((insight) => {
          const severity = insight.severity as keyof typeof SEVERITY_STYLES;
          const category = insight.category as keyof typeof CATEGORY_STYLES;
          const adopted = insight.status === "adopted";
          const busy = adoptingId === insight.id;

          return (
            <article
              key={insight.id}
              className={cn(
                "flex flex-col rounded-xl border border-white/[0.08] bg-[#080c12]/90 p-4 transition-colors",
                adopted && "border-emerald-500/25 bg-emerald-500/[0.04]",
                (loading || busy) && "pointer-events-none opacity-60",
              )}
            >
              <div className={cn("mb-2 flex flex-wrap items-start justify-between gap-2", isRtl && "flex-row-reverse")}>
                <h4 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-zinc-50">
                  {insight.title}
                </h4>
                <div className={cn("flex shrink-0 flex-wrap gap-1", isRtl && "flex-row-reverse")}>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      CATEGORY_STYLES[category] ?? CATEGORY_STYLES.UX,
                    )}
                  >
                    {t(`categories.${category}`)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.MEDIUM,
                    )}
                  >
                    {severity}
                  </span>
                </div>
              </div>

              <p className="mb-3 flex-1 text-xs leading-relaxed text-zinc-500">
                {insight.description}
              </p>

              {!adopted ? (
                <div className={cn("flex gap-2", isRtl && "flex-row-reverse")}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 flex-1 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                    onClick={() => onDismiss(insight.id)}
                  >
                    <X className="me-1 size-3.5" aria-hidden />
                    {t("dismiss")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!adoptEnabled || busy}
                    className={cn(
                      "h-8 flex-1",
                      adoptEnabled
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "cursor-not-allowed bg-zinc-800 text-zinc-500",
                    )}
                    onClick={() => {
                      if (!adoptEnabled) return;
                      onAdopt(insight);
                    }}
                  >
                    {t("adopt")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300/90">
                  <Check className="size-3.5" aria-hidden />
                  {t("inActiveContext")}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
