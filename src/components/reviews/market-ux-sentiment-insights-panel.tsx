"use client";

import { MessageSquareQuote, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { UxSentimentInsightSignal } from "@/lib/market/market-intel-signal-types";
import { getCategoryLabel } from "@/lib/market/category-labels";

type Props = {
  insights: UxSentimentInsightSignal[];
  meta: { category: string; country: string } | null;
  isRtl?: boolean;
};

const KIND_TONE: Record<
  UxSentimentInsightSignal["insightKind"],
  string
> = {
  category_narrative: "border-sky-500/25 bg-sky-500/[0.06] text-sky-200/90",
  aso_recommendation: "border-amber-500/25 bg-amber-500/[0.06] text-amber-100/85",
  sentiment_theme: "border-violet-500/25 bg-violet-500/[0.06] text-violet-100/85",
};

export function MarketUxSentimentInsightsPanel({
  insights,
  meta,
  isRtl = false,
}: Props) {
  const t = useTranslations("reviews.marketUxInsights");

  if (insights.length === 0) return null;

  const categoryLabel = meta?.category ? getCategoryLabel(meta.category) : null;

  return (
    <section
      className="rounded-2xl border border-white/[0.08] bg-[#0c1018] p-5 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]"
      aria-labelledby="market-ux-insights-heading"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className={cn("mb-4 flex items-start gap-3", isRtl && "flex-row-reverse")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10">
          <Sparkles className="size-4 text-sky-300" aria-hidden />
        </div>
        <div className={isRtl ? "text-end font-arabic" : ""}>
          <h2
            id="market-ux-insights-heading"
            className="text-base font-semibold text-white"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">{t("subtitle")}</p>
          {categoryLabel && meta?.country ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              {t("sourceMeta", {
                category: categoryLabel,
                country: meta.country.toUpperCase(),
              })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className={cn(
              "rounded-xl border p-4",
              KIND_TONE[insight.insightKind],
              isRtl && "font-arabic text-end",
            )}
          >
            <div className={cn("mb-2 flex items-center gap-2", isRtl && "flex-row-reverse")}>
              <MessageSquareQuote className="size-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {t(`kinds.${insight.insightKind}`)}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white/95">{insight.headline}</h3>
            <p className="mt-1.5 text-xs leading-relaxed opacity-90">{insight.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
