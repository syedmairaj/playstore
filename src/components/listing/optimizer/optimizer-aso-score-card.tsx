"use client";

import { Info, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { cn } from "@/lib/utils";

function RoadmapBullet({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-2 w-2 shrink-0", className)}
      viewBox="0 0 8 8"
      fill="none"
      aria-hidden
    >
      <circle cx="4" cy="4" r="3.5" stroke="rgb(16,185,129)" strokeWidth="1" />
    </svg>
  );
}

type Props = {
  asoScore: number;
  scoreBreakdown: NonNullable<ListingGenerationOutput["scoreBreakdown"]>;
  improvementTips: string[];
  showSuccessPulse?: boolean;
  isRtl?: boolean;
};

export function OptimizerAsoScoreCard({
  asoScore,
  scoreBreakdown,
  improvementTips,
  showSuccessPulse = false,
  isRtl = false,
}: Props) {
  const t = useTranslations("optimizer");

  const breakdownRows = [
    {
      key: "title",
      label: t("results.asoBreakdownTitle"),
      value: scoreBreakdown.title,
      max: 30,
    },
    {
      key: "short",
      label: t("results.asoBreakdownShort"),
      value: scoreBreakdown.shortDescription,
      max: 20,
    },
    {
      key: "long",
      label: t("results.asoBreakdownLong"),
      value: scoreBreakdown.longDescription,
      max: 40,
    },
    {
      key: "persuasion",
      label: t("results.asoBreakdownPersuasion"),
      value: scoreBreakdown.persuasiveness,
      max: 10,
    },
  ] as const;

  return (
    <article
      className={cn(
        "relative w-full overflow-visible rounded-2xl border border-emerald-500/15 bg-[#0B0E14]/90 p-6 sm:p-9",
        "shadow-[0_24px_64px_-32px_rgba(34,197,94,0.28),inset_0_1px_0_0_rgba(34,197,94,0.08)]",
        showSuccessPulse && "motion-safe:animate-fade-up",
      )}
      aria-labelledby="optimizer-aso-score-heading"
    >
      <div
        className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -start-12 size-56 rounded-full bg-emerald-600/5 blur-3xl"
        aria-hidden
      />

      <h3 id="optimizer-aso-score-heading" className="sr-only">
        {t("results.certifiedScoreBlockTitle")}
      </h3>

      <header
        className={cn(
          "mb-8 flex flex-wrap items-start justify-between gap-3 overflow-visible sm:mb-10",
          isRtl && "flex-row-reverse",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            isRtl && "flex-row-reverse",
          )}
        >
          <Sparkles className="size-4 shrink-0 text-emerald-400/80" aria-hidden />
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
            {t("results.certifiedBadgeLabel")}
          </span>
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5",
            isRtl && "flex-row-reverse",
          )}
        >
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-100 shadow-[0_0_20px_-8px_rgba(34,197,94,0.45)]">
            {t("results.certifiedAuditBadgeLabel")}
          </span>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-800/80 hover:text-zinc-200"
            title={t("results.asoScoreTooltip")}
            aria-label={t("results.asoScoreInfoAria")}
          >
            <Info className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex w-full flex-col gap-8 overflow-visible">
        <div className="flex flex-col items-center justify-center text-center sm:items-start sm:text-start">
          <div
            className={cn(
              "relative flex flex-wrap items-baseline justify-center gap-1 sm:justify-start",
              isRtl && "flex-row-reverse",
              "before:pointer-events-none before:absolute before:inset-[-1.5rem] before:rounded-full before:bg-emerald-500/10 before:blur-2xl",
            )}
          >
            <span
              className={cn(
                "relative font-sans text-7xl font-extrabold tabular-nums tracking-tight text-white sm:text-8xl",
                "drop-shadow-[0_0_56px_rgba(34,197,94,0.4)]",
              )}
            >
              {asoScore}
            </span>
            <span className="relative text-xl font-medium tabular-nums text-zinc-500 sm:text-2xl">
              {t("results.certifiedScoreSlash")}
            </span>
          </div>
          <p className="mt-4 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            {t("results.asoQualityScoreLabel")}
          </p>
        </div>

        <div className="w-full min-w-0 space-y-7 overflow-visible">
          <div className="space-y-4 overflow-visible">
            <p className="text-start text-sm font-semibold text-white">
              {t("results.asoBreakdownHeading")}
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-4 overflow-visible">
              {breakdownRows.map((row) => {
                const value =
                  typeof row.value === "number" && Number.isFinite(row.value)
                    ? row.value
                    : 0;
                const pct = Math.min(
                  100,
                  Math.max(0, Math.round((value / row.max) * 100)),
                );
                return (
                  <li
                    key={row.key}
                    className="min-w-[min(100%,11rem)] flex-[1_1_calc(50%-0.625rem)] space-y-2 overflow-visible max-sm:basis-full max-sm:flex-[1_1_100%]"
                  >
                    <div
                      className={cn(
                        "flex items-baseline justify-between gap-2 text-xs max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5",
                        isRtl && "sm:flex-row-reverse",
                      )}
                    >
                      <span className="basis-full whitespace-nowrap text-start font-medium text-zinc-300 sm:basis-auto">
                        {row.label}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-baseline gap-2 tabular-nums",
                          isRtl && "flex-row-reverse",
                        )}
                      >
                        <span className="whitespace-nowrap text-[11px] font-semibold text-emerald-300/90">
                          {t("results.breakdownPercent", { percent: pct })}
                        </span>
                        <span className="whitespace-nowrap text-zinc-500">
                          {value}/{row.max}
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90"
                      dir={isRtl ? "rtl" : "ltr"}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={row.max}
                      aria-valuenow={value}
                      aria-valuetext={t("results.breakdownPercent", {
                        percent: pct,
                      })}
                      aria-label={row.label}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-700 ease-out",
                          isRtl && "bg-gradient-to-l",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-4 overflow-visible border-t border-zinc-800/70 pt-7">
            <p className="text-start text-sm font-semibold text-white">
              {t("results.improvementTipsHeading")}
            </p>
            <ul className="flex flex-col gap-y-4">
              {improvementTips.map((tip, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex gap-3 overflow-visible rounded-xl bg-white/[0.02] px-4 py-3.5 text-start text-base leading-relaxed text-zinc-400",
                    isRtl && "flex-row-reverse",
                  )}
                >
                  <RoadmapBullet className="mt-[0.5rem]" />
                  <span className="min-w-0 flex-1">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </article>
  );
}
