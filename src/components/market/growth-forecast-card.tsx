"use client";

import { useTranslations } from "next-intl";
import { Activity, Info, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";
import {
  resolveForecastEmptyVariant,
  MIN_POST_DEPLOY_RANK_DAYS,
  type ForecastEmptyVariant,
} from "@/lib/market/wins-empty-variants";
import {
  EducationalEmptyState,
  MetricTitleWithInfo,
} from "@/components/market/wins-educational-empty-state";

type Props = {
  forecast: GrowthForecastResult | undefined;
  /** True only while the initial data request is in-flight. */
  showSkeleton?: boolean;
  isRtl?: boolean;
};

function ForecastSkeleton({ isRtl }: { isRtl: boolean }) {
  return (
    <div className="space-y-3 px-4 py-3" aria-hidden>
      <div className="h-[72px] rounded-lg bg-zinc-800/50" />
      <div className={cn("flex justify-between gap-3", isRtl && "flex-row-reverse")}>
        <div className="space-y-2">
          <div className="h-2.5 w-20 rounded bg-zinc-800/45" />
          <div className="h-4 w-44 rounded bg-zinc-800/55" />
        </div>
        <div className="space-y-2 text-end">
          <div className="ms-auto h-2.5 w-16 rounded bg-zinc-800/45" />
          <div className="ms-auto h-3.5 w-12 rounded bg-zinc-800/55" />
        </div>
      </div>
      <div className="h-2.5 w-full max-w-md rounded bg-zinc-800/40" />
    </div>
  );
}

function ForecastTrendLine({
  points,
  isRtl,
}: {
  points: number[];
  isRtl: boolean;
}) {
  const width = 280;
  const height = 72;
  const padding = 8;
  const max = Math.max(...points, 1);
  const min = 0;
  const range = max - min || 1;

  const coords = points.map((value, index) => {
    const x =
      padding +
      (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const polyline = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = [
    `M ${coords[0]?.x ?? padding} ${height - padding}`,
    ...coords.map((p) => `L ${p.x} ${p.y}`),
    `L ${coords[coords.length - 1]?.x ?? width - padding} ${height - padding}`,
    "Z",
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-[72px] w-full", isRtl && "scale-x-[-1]")}
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(52, 211, 153)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(52, 211, 153)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#forecastFill)" />
      <polyline
        points={polyline}
        fill="none"
        stroke="rgb(52, 211, 153)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="2.5"
          fill="rgb(167, 243, 208)"
          stroke="rgb(52, 211, 153)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function forecastSteps(
  t: ReturnType<typeof useTranslations<"market.wins.forecast">>,
  variant: ForecastEmptyVariant,
  values: { days: number; minDays: number },
): string[] {
  return [
    t(`emptyStates.${variant}.step1`, values),
    t(`emptyStates.${variant}.step2`, values),
    t(`emptyStates.${variant}.step3`, values),
  ];
}

function WhyFiveDaysTooltip({
  label,
  tooltip,
  isRtl,
}: {
  label: string;
  tooltip: string;
  isRtl: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip content={tooltip} side={isRtl ? "left" : "top"} asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:bg-white/6 hover:text-zinc-300",
            isRtl && "flex-row-reverse",
          )}
          aria-label={tooltip}
        >
          <Info className="size-3 shrink-0" aria-hidden />
          <span>{label}</span>
        </button>
      </Tooltip>
    </TooltipProvider>
  );
}

function ForecastCalibratingState({
  days,
  minDays,
  isRtl,
}: {
  days: number;
  minDays: number;
  isRtl: boolean;
}) {
  const t = useTranslations("market.wins.forecast");
  const progressPct = Math.min(100, Math.round((days / minDays) * 100));

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6",
        isRtl && "text-end",
      )}
    >
      <div
        className={cn(
          "flex items-start gap-2.5",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10">
          <Activity className="size-4 text-emerald-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1",
              isRtl && "flex-row-reverse justify-end",
            )}
          >
            <p className="text-sm font-semibold text-zinc-200">
              {t("emptyStates.needRankHistory.title")}
            </p>
            <WhyFiveDaysTooltip
              label={t("whyFiveDaysLabel")}
              tooltip={t("whyFiveDaysTooltip")}
              isRtl={isRtl}
            />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            {t("emptyStates.needRankHistory.body", { minDays })}
          </p>
          <p className="mt-2 text-xs font-medium text-zinc-400">
            {t("emptyStates.needRankHistory.progress", { days, minDays })}
          </p>
          <div className="mt-3">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-zinc-800/80"
              role="progressbar"
              aria-valuenow={days}
              aria-valuemin={0}
              aria-valuemax={minDays}
              aria-label={t("emptyStates.needRankHistory.progress", {
                days,
                minDays,
              })}
            >
              <div
                className="h-full rounded-full bg-emerald-500/70 transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      <ol
        className={cn(
          "mt-4 space-y-2 border-t border-white/6 pt-3",
          isRtl && "text-end",
        )}
      >
        {forecastSteps(t, "needRankHistory", { days, minDays }).map((step, i) => (
          <li
            key={step.slice(0, 32)}
            className={cn(
              "flex gap-2 text-[11px] leading-relaxed text-zinc-400",
              isRtl && "flex-row-reverse",
            )}
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GrowthForecastCard({
  forecast,
  showSkeleton = false,
  isRtl = false,
}: Props) {
  const t = useTranslations("market.wins.forecast");

  const ready =
    !showSkeleton &&
    forecast?.status === "ready" &&
    forecast.trendPoints.length > 0;

  const emptyVariant =
    !showSkeleton && forecast && forecast.status === "gathering"
      ? resolveForecastEmptyVariant(forecast)
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/8 bg-white/3 overflow-hidden",
        isRtl && "font-arabic text-end",
      )}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div
        className={cn(
          "flex items-start gap-3 border-b border-white/6 px-4 py-3.5",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
          <LineChart className="size-4 text-emerald-300" aria-hidden />
        </div>
        <MetricTitleWithInfo
          title={t("title")}
          subtitle={t("subtitle")}
          tooltip={t("titleTooltip")}
          isRtl={isRtl}
        />
      </div>

      {showSkeleton ? (
        <ForecastSkeleton isRtl={isRtl} />
      ) : emptyVariant === "needRankHistory" ? (
        <div className="px-4 py-3">
          <ForecastCalibratingState
            days={forecast?.postDeploymentDataDays ?? 0}
            minDays={MIN_POST_DEPLOY_RANK_DAYS}
            isRtl={isRtl}
          />
        </div>
      ) : emptyVariant ? (
        <div className="px-4 py-3">
          <EducationalEmptyState
            title={t(`emptyStates.${emptyVariant}.title`)}
            body={t(`emptyStates.${emptyVariant}.body`, {
              days: forecast?.postDeploymentDataDays ?? 0,
              minDays: MIN_POST_DEPLOY_RANK_DAYS,
            })}
            steps={forecastSteps(t, emptyVariant, {
              days: forecast?.postDeploymentDataDays ?? 0,
              minDays: MIN_POST_DEPLOY_RANK_DAYS,
            })}
            isRtl={isRtl}
          />
        </div>
      ) : ready && forecast ? (
        <div className="px-4 py-3">
          <ForecastTrendLine points={forecast.trendPoints} isRtl={isRtl} />
          <div
            className={cn(
              "mt-3 flex flex-wrap items-end justify-between gap-2",
              isRtl && "flex-row-reverse",
            )}
          >
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {t("potentialGain")}
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-300">
                {t("projectedInstalls", {
                  count: forecast.projectedMonthlyInstalls ?? 0,
                })}
              </p>
            </div>
            <div className={cn("text-end", isRtl && "text-start")}>
              <p className="text-[10px] text-zinc-500">{t("velocityLabel")}</p>
              <p className="text-xs font-medium tabular-nums text-zinc-300">
                {t("velocityValue", {
                  value: forecast.estimatedInstallVelocity ?? 0,
                })}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
            {t("methodNote", {
              days: forecast.postDeploymentDataDays,
              cvr: forecast.conversionRatePercent ?? 0,
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
