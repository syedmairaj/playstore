"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import type { KeywordRankWin, RankProgressResult } from "@/lib/market/rank-progress.types";
import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";
import { GATHERING_FORECAST } from "@/lib/market/growth-forecast.types";
import type { LiveRankTrackingResult } from "@/lib/market/rank-tracking.types";
import { EMPTY_LIVE_RANK_TRACKING } from "@/lib/market/wins-dashboard-payload";
import { queryDefaultsFor } from "@/lib/client/query-cache-policy";
import { GrowthForecastCard } from "@/components/market/growth-forecast-card";
import { LiveRankTrackingTable } from "@/components/market/live-rank-tracking-table";
import { PerformanceAlertCard } from "@/components/market/performance-alert-card";
import {
  EducationalEmptyState,
  MetricTitleWithInfo,
} from "@/components/market/wins-educational-empty-state";
import {
  MIN_RANK_WIN_POSITIONS,
  resolveWinsEmptyVariant,
  type WinsEmptyVariant,
} from "@/lib/market/wins-empty-variants";

type WinsDashboardPayload = {
  progress: RankProgressResult;
  forecast: GrowthForecastResult;
  tracking: LiveRankTrackingResult;
};

function isRankProgressResult(value: unknown): value is RankProgressResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "wins" in value &&
    Array.isArray((value as RankProgressResult).wins)
  );
}

function isGrowthForecastResult(value: unknown): value is GrowthForecastResult {
  if (typeof value !== "object" || value === null) return false;
  const status = (value as GrowthForecastResult).status;
  return status === "ready" || status === "gathering";
}

function isLiveRankTrackingResult(value: unknown): value is LiveRankTrackingResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "rows" in value &&
    Array.isArray((value as LiveRankTrackingResult).rows)
  );
}

function normalizeTrackingPayload(
  tracking: LiveRankTrackingResult | undefined,
): LiveRankTrackingResult {
  if (!tracking) return EMPTY_LIVE_RANK_TRACKING;
  return {
    rows: tracking.rows ?? [],
    alerts: tracking.alerts ?? [],
    keywordCount:
      typeof tracking.keywordCount === "number"
        ? tracking.keywordCount
        : tracking.rows.length,
    hasDeployment: tracking.hasDeployment ?? false,
    keywordScope: tracking.keywordScope ?? "workspace",
  };
}

function normalizeWinsDashboardPayload(
  json: Record<string, unknown>,
): WinsDashboardPayload | null {
  if (isRankProgressResult(json.progress)) {
    return {
      progress: json.progress,
      forecast: isGrowthForecastResult(json.forecast)
        ? json.forecast
        : GATHERING_FORECAST,
      tracking: isLiveRankTrackingResult(json.tracking)
        ? normalizeTrackingPayload(json.tracking as LiveRankTrackingResult)
        : EMPTY_LIVE_RANK_TRACKING,
    };
  }
  if (isRankProgressResult(json)) {
    return {
      progress: json,
      forecast: GATHERING_FORECAST,
      tracking: EMPTY_LIVE_RANK_TRACKING,
    };
  }
  return null;
}

function resolveDashboardPayload(
  data: WinsDashboardPayload | RankProgressResult | undefined,
): WinsDashboardPayload | undefined {
  if (!data) return undefined;
  if ("progress" in data && data.progress) {
    return {
      progress: data.progress,
      forecast: data.forecast ?? GATHERING_FORECAST,
      tracking: data.tracking
        ? normalizeTrackingPayload(data.tracking)
        : EMPTY_LIVE_RANK_TRACKING,
    };
  }
  if (isRankProgressResult(data)) {
    return {
      progress: data,
      forecast: GATHERING_FORECAST,
      tracking: EMPTY_LIVE_RANK_TRACKING,
    };
  }
  return undefined;
}

type Props = {
  workspaceId: string;
  appId: string | undefined;
  isRtl?: boolean;
};

function formatRank(rank: number): string {
  if (rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return "100+";
  return `#${rank}`;
}

function formatDeploymentDate(iso: string, isRtl: boolean): string {
  return new Intl.DateTimeFormat(isRtl ? "ar" : "en", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

function WinRow({
  win,
  t,
  isRtl,
}: {
  win: KeywordRankWin;
  t: ReturnType<typeof useTranslations<"market.wins">>;
  isRtl: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden transition-colors hover:border-white/12">
      <div
        className={cn(
          "grid w-full items-center gap-3 px-4 py-3.5",
          "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]",
          isRtl && "text-end",
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{win.term}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {win.market}
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 text-xs tabular-nums text-zinc-400",
            isRtl && "flex-row-reverse justify-end",
          )}
        >
          <span>{formatRank(win.rankAtDeployment)}</span>
          <ArrowRight className="size-3 shrink-0 text-zinc-600" aria-hidden />
          <span className="font-semibold text-zinc-200">
            {formatRank(win.currentRank)}
          </span>
        </div>

        <span
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-emerald-300"
          title={t("gainTooltip", { positions: win.positionsGained })}
        >
          <TrendingUp className="size-3 shrink-0" aria-hidden />
          +{win.positionsGained}
        </span>
      </div>
    </div>
  );
}

function WinsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[68px] rounded-xl border border-white/6 bg-zinc-800/35"
        />
      ))}
    </div>
  );
}

function winsEmptySteps(
  t: ReturnType<typeof useTranslations<"market.wins">>,
  variant: WinsEmptyVariant,
  values: { threshold: number; count: number },
): string[] {
  return [
    t(`emptyStates.wins.${variant}.step1`, values),
    t(`emptyStates.wins.${variant}.step2`, values),
    t(`emptyStates.wins.${variant}.step3`, values),
  ];
}

export function WinsDashboard({ workspaceId, appId, isRtl = false }: Props) {
  const t = useTranslations("market.wins");
  const locale = useLocale();
  const optimizerHref = `/${locale}/app/${workspaceId}/listing-optimizer`;

  const { data: rawData, isPending, isError, refetch } = useQuery({
    queryKey: ["market-rank-wins", workspaceId, appId, "v5"],
    queryFn: async (): Promise<WinsDashboardPayload> => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/market/rank-wins?appId=${encodeURIComponent(appId!)}`,
      );
      const json = (await res.json()) as Record<string, unknown> & {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!json.ok) {
        throw new Error(json.error?.message ?? t("loadError"));
      }
      const payload = normalizeWinsDashboardPayload(json);
      if (!payload) {
        throw new Error(t("loadError"));
      }
      return payload;
    },
    enabled: Boolean(appId),
    staleTime: queryDefaultsFor("marketRankWins").staleTime,
    gcTime: queryDefaultsFor("marketRankWins").gcTime,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });

  const data = resolveDashboardPayload(
    rawData as WinsDashboardPayload | RankProgressResult | undefined,
  );

  const showInitialSkeleton = isPending && !data;

  const deploymentLabel =
    data?.progress?.deploymentDate != null
      ? formatDeploymentDate(data.progress.deploymentDate, isRtl)
      : null;

  const winsEmptyVariant =
    !showInitialSkeleton && data?.progress && data.progress.wins.length === 0
      ? resolveWinsEmptyVariant(data.progress)
      : null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-800 bg-white/[0.025] p-5",
        isRtl && "font-arabic text-end",
      )}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {!showInitialSkeleton && data?.tracking?.alerts?.length ? (
        <PerformanceAlertCard
          alerts={data.tracking.alerts}
          optimizerHref={optimizerHref}
          isRtl={isRtl}
        />
      ) : null}

      <div
        className={cn(
          "mb-4 flex flex-wrap items-start gap-3",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <Trophy className="size-4 text-emerald-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <MetricTitleWithInfo
            title={t("title")}
            subtitle={t("subtitle")}
            tooltip={t("titleTooltip")}
            isRtl={isRtl}
          />
        </div>
        {data?.progress?.wins && data.progress.wins.length > 0 ? (
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
            {t("winCount", { count: data.progress.wins.length })}
          </span>
        ) : null}
      </div>

      {!appId ? (
        <div className="rounded-xl border border-dashed border-white/8 py-10 text-center">
          <p className="text-sm text-zinc-400">{t("needApp")}</p>
        </div>
      ) : showInitialSkeleton ? (
        <WinsSkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
          <p>{t("loadError")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-xs font-medium text-red-200 underline-offset-2 hover:underline"
          >
            {t("retry")}
          </button>
        </div>
      ) : data?.progress?.wins && data.progress.wins.length > 0 ? (
        <div className="mb-4 space-y-2">
          <div
            className={cn(
              "mb-1 hidden gap-3 px-4 sm:grid",
              "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]",
              isRtl && "text-end",
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {t("colKeyword")}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {t("colRankChange")}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {t("colGain")}
            </p>
          </div>
          {data.progress.wins.map((win) => (
            <WinRow key={win.keywordId} win={win} t={t} isRtl={isRtl} />
          ))}
        </div>
      ) : winsEmptyVariant ? (
        <div className="mb-4">
          <EducationalEmptyState
            title={t(`emptyStates.wins.${winsEmptyVariant}.title`)}
            body={t(`emptyStates.wins.${winsEmptyVariant}.body`, {
              threshold: MIN_RANK_WIN_POSITIONS,
              count: data?.progress?.trackedKeywordCount ?? 0,
            })}
            steps={winsEmptySteps(t, winsEmptyVariant, {
              threshold: MIN_RANK_WIN_POSITIONS,
              count: data?.progress?.trackedKeywordCount ?? 0,
            })}
            isRtl={isRtl}
          />
        </div>
      ) : null}

      <div className="mb-4">
        <GrowthForecastCard
          forecast={data?.forecast}
          showSkeleton={showInitialSkeleton}
          isRtl={isRtl}
        />
      </div>

      <div className="mb-4">
        {deploymentLabel ? (
          <p className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-zinc-400">
            {t("correlationNote", { date: deploymentLabel })}
          </p>
        ) : !showInitialSkeleton && appId ? (
          <p className="rounded-xl border border-amber-500/15 bg-amber-500/6 px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/85">
            {t("noDeploymentNote")}
          </p>
        ) : null}
      </div>

      {appId ? (
        <LiveRankTrackingTable
          workspaceId={workspaceId}
          rows={data?.tracking?.rows ?? []}
          keywordCount={data?.tracking?.keywordCount ?? data?.progress?.trackedKeywordCount ?? 0}
          hasDeployment={data?.tracking?.hasDeployment ?? Boolean(data?.progress?.deploymentDate)}
          showSkeleton={showInitialSkeleton}
          isRtl={isRtl}
        />
      ) : null}
    </div>
  );
}
