"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import type { KeywordRankCorrelation } from "@/lib/market/rank-tracking.types";
import {
  EducationalEmptyState,
  MetricTitleWithInfo,
} from "@/components/market/wins-educational-empty-state";

type Props = {
  workspaceId: string;
  rows: KeywordRankCorrelation[];
  keywordCount?: number;
  hasDeployment?: boolean;
  showSkeleton?: boolean;
  isRtl?: boolean;
};

function liveTrackingSteps(
  t: ReturnType<typeof useTranslations<"market.wins.liveTracking">>,
): string[] {
  return [t("howTo.step1"), t("howTo.step2"), t("howTo.step3"), t("howTo.step4")];
}

function formatMarketRank(
  rank: number | null,
  pendingDeployment: boolean,
  t: ReturnType<typeof useTranslations<"market.wins.liveTracking">>,
): string {
  if (rank == null && pendingDeployment) return t("pendingDeployment");
  if (rank == null) return "—";
  if (rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return "100+";
  return `#${rank}`;
}

function RankSparkline({
  points,
  isRtl,
}: {
  points: (number | null)[];
  isRtl: boolean;
}) {
  const valid = points.filter((p): p is number => p != null);
  if (valid.length < 2) {
    return (
      <p className="py-4 text-center text-[11px] text-zinc-500">
        —
      </p>
    );
  }

  const width = 240;
  const height = 56;
  const padding = 8;
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const range = max - min || 1;

  const coords = points
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      if (value == null) return null;
      const y = padding + ((max - value) / range) * (height - padding * 2);
      return { x, y, value };
    })
    .filter((p): p is { x: number; y: number; value: number } => p != null);

  if (coords.length < 2) {
    return (
      <p className="py-4 text-center text-[11px] text-zinc-500">
        —
      </p>
    );
  }

  const polyline = coords.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("mx-auto h-14 w-full max-w-[240px]", isRtl && "scale-x-[-1]")}
      role="img"
      aria-hidden
    >
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
          r="2"
          fill="rgb(167, 243, 208)"
          stroke="rgb(52, 211, 153)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function RankChangeBadge({
  change,
  t,
}: {
  change: number | null;
  t: ReturnType<typeof useTranslations<"market.wins.liveTracking">>;
}) {
  if (change == null || change === 0) {
    return (
      <span className="text-xs tabular-nums text-zinc-500">{t("neutral")}</span>
    );
  }
  if (change > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-300">
        {t("gain", { value: change })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-300">
      {t("drop", { value: Math.abs(change) })}
    </span>
  );
}

function TrackingTableSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-[52px] rounded-xl border border-white/6 bg-zinc-800/35"
        />
      ))}
    </div>
  );
}

function LiveTrackingHowToPanel({
  t,
  steps,
  keywordTrackerHref,
  optimizerHref,
  isRtl,
}: {
  t: ReturnType<typeof useTranslations<"market.wins.liveTracking">>;
  steps: string[];
  keywordTrackerHref: string;
  optimizerHref: string;
  isRtl: boolean;
}) {
  return (
    <EducationalEmptyState
      title={t("howTo.title")}
      body={t.rich("howTo.body", {
        keywordTracker: (chunks) => (
          <Link
            href={keywordTrackerHref}
            className="font-medium text-sky-300 underline-offset-2 hover:underline"
          >
            {chunks}
          </Link>
        ),
        optimizer: (chunks) => (
          <Link
            href={optimizerHref}
            className="font-medium text-sky-300 underline-offset-2 hover:underline"
          >
            {chunks}
          </Link>
        ),
      })}
      steps={steps}
      isRtl={isRtl}
    />
  );
}

export function LiveRankTrackingTable({
  workspaceId,
  rows,
  keywordCount = 0,
  hasDeployment = false,
  showSkeleton = false,
  isRtl = false,
}: Props) {
  const t = useTranslations("market.wins.liveTracking");
  const locale = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pendingDeployment = !hasDeployment && keywordCount > 0;
  const steps = liveTrackingSteps(t);
  const keywordTrackerHref = `/${locale}/app/${workspaceId}/keywords`;
  const optimizerHref = `/${locale}/app/${workspaceId}/listing-optimizer`;
  const missingLiveRanks =
    keywordCount > 0 && rows.every((row) => row.currentRank == null);

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
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10">
          <LineChart className="size-4 text-sky-300" aria-hidden />
        </div>
        <MetricTitleWithInfo
          title={t("title")}
          subtitle={t("subtitle")}
          tooltip={t("titleTooltip")}
          isRtl={isRtl}
        />
      </div>

      <div className="px-4 py-3">
        {showSkeleton ? (
          <TrackingTableSkeleton />
        ) : keywordCount === 0 ? (
          <LiveTrackingHowToPanel
            t={t}
            steps={steps}
            keywordTrackerHref={keywordTrackerHref}
            optimizerHref={optimizerHref}
            isRtl={isRtl}
          />
        ) : (
          <div className="space-y-2">
            {pendingDeployment ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2.5 text-xs leading-relaxed text-amber-100/90">
                {t("pendingDeploymentBanner", { count: keywordCount })}
              </p>
            ) : null}

            {missingLiveRanks ? (
              <LiveTrackingHowToPanel
                t={t}
                steps={steps}
                keywordTrackerHref={keywordTrackerHref}
                optimizerHref={optimizerHref}
                isRtl={isRtl}
              />
            ) : null}

            <div
              className={cn(
                "hidden gap-3 px-3 sm:grid",
                "grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.75fr))_auto]",
                isRtl && "text-end",
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {t("colKeyword")}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {t("colPreDeployment")}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {t("colCurrent")}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {t("colChange")}
              </p>
              <span className="sr-only">{t("expandSparkline")}</span>
            </div>

            {rows.map((row) => {
              const expanded = expandedId === row.keywordId;
              return (
                <div
                  key={row.keywordId}
                  className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden transition-colors hover:border-white/12"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expanded ? null : row.keywordId)
                    }
                    className={cn(
                      "grid w-full items-center gap-3 px-3 py-3 text-start",
                      "grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.75fr))_auto]",
                      isRtl && "text-end",
                    )}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {row.term}
                      </p>
                      {row.monitoringStatus === "tracking_pending" ? (
                        <span className="mt-1 inline-flex rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300">
                          {t("statusTrackingPending")}
                        </span>
                      ) : null}
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                        {row.market}
                      </p>
                    </div>
                    <p className="text-xs tabular-nums text-zinc-400">
                      {formatMarketRank(row.preDeploymentRank, pendingDeployment, t)}
                    </p>
                    <p className="text-xs font-medium tabular-nums text-zinc-200">
                      {formatMarketRank(row.currentRank, false, t)}
                    </p>
                    <div>
                      <RankChangeBadge change={row.rankChange} t={t} />
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-zinc-500 transition-transform",
                        expanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {expanded ? (
                    <div className="border-t border-white/6 bg-white/[0.02] px-4 py-3">
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        {t("expandSparkline")}
                      </p>
                      <RankSparkline points={row.sparkline7d} isRtl={isRtl} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
