"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ReviewGrowthMode } from "@/lib/review-insights/growth-strategy-tags";

type ReviewsArchitectTipProps = {
  mode: ReviewGrowthMode;
  isRtl?: boolean;
  className?: string;
};

/**
 * Persistent Expert Tip — Architect's Guide for Defensive vs Offensive review modes.
 */
export function ReviewsArchitectTip({
  mode,
  isRtl = false,
  className,
}: ReviewsArchitectTipProps) {
  const t = useTranslations("reviews.growthMode");

  return (
    <aside
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3",
        mode === "defensive"
          ? "border-sky-500/20 bg-sky-500/[0.06]"
          : "border-orange-500/20 bg-orange-500/[0.06]",
        isRtl && "flex-row-reverse text-end font-arabic",
        className,
      )}
      dir={isRtl ? "rtl" : "ltr"}
      aria-label={t("expertTipLabel")}
    >
      <Info
        className={cn(
          "mt-0.5 size-4 shrink-0",
          mode === "defensive" ? "text-sky-400/80" : "text-orange-400/80",
        )}
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {t("expertTipLabel")}
        </p>
        <p className="text-[12px] leading-relaxed text-white/70">
          {mode === "defensive" ? t("defensiveTip") : t("offensiveTip")}
        </p>
      </div>
    </aside>
  );
}
