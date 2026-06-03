"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import {
  COUNTRY_FLAG_EMOJI,
  countriesForKeywordRankChips,
  isSupportedCountry,
  primaryMarketCode,
  type SupportedCountryCode,
} from "@/lib/countries";
import { formatRankForDisplay } from "@/lib/keywords/format-rank-display";
import { rankSnapshotInstantMs } from "@/lib/keywords/collapse-rank-snapshots-for-display";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

const MS_DAY = 24 * 60 * 60 * 1000;

/** Distinct emerald-family strokes for regional multi-line chart. */
const REGIONAL_LINE_COLORS = ["#34d399", "#2dd4bf", "#10b981", "#5eead4", "#059669", "#6ee7b7", "#047857"];

export type KeywordHistoryDialogProps = {
  workspaceId: string;
  keyword: KeywordWithRanks | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional app rows (for target market chips next to rank). */
  apps?: WorkspaceAppListRow[];
};

type RangeDays = 7 | 14 | 30;

type RankPoint = {
  rank: number | null;
  captured_at: string;
  country_code?: string | null;
  source?: string | null;
};

function bestRank(ranks: { rank: number | null }[]): number | null {
  const nums = ranks
    .map((r) => r.rank)
    .filter(
      (n): n is number =>
        n != null && n <= SERPER_RANK_NOT_IN_FIRST_PAGE,
    );
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

function averageRankLastDays(ranks: RankPoint[], days: number): number | null {
  const cutoff = Date.now() - days * MS_DAY;
  const nums = ranks
    .filter(
      (r) =>
        r.rank != null &&
        r.rank < SERPER_RANK_NOT_IN_FIRST_PAGE &&
        new Date(r.captured_at).getTime() >= cutoff,
    )
    .map((r) => r.rank as number);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function ranksInWindow(ranksChrono: RankPoint[], days: RangeDays): RankPoint[] {
  const cutoff = Date.now() - days * MS_DAY;
  return ranksChrono.filter((r) => new Date(r.captured_at).getTime() >= cutoff);
}

function trendTone(ranksChrono: RankPoint[], days: RangeDays): "improved" | "worse" | "same" | "unknown" {
  const windowed = ranksInWindow(ranksChrono, days).filter(
    (r) => r.rank != null && r.rank < SERPER_RANK_NOT_IN_FIRST_PAGE,
  );
  if (windowed.length < 2) return "unknown";
  const first = windowed[0].rank as number;
  const last = windowed[windowed.length - 1].rank as number;
  if (last < first) return "improved";
  if (last > first) return "worse";
  return "same";
}

export function KeywordHistoryDialog({
  workspaceId,
  keyword,
  open,
  onOpenChange,
  apps = [],
}: KeywordHistoryDialogProps) {
  const t = useTranslations("keywordTracker.history");
  const tDelta = useTranslations("keywordTracker.delta");
  const tRankFmt = useTranslations("keywordTracker.table");
  const tCountrySel = useTranslations("countrySelector");
  const locale = useLocale();
  const [remote, setRemote] = useState<KeywordWithRanks | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<RangeDays>(30);
  const [historyTab, setHistoryTab] = useState<"rank" | "regional">("rank");

  const data = remote ?? keyword;

  const refresh = useCallback(async () => {
    if (!keyword?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/keywords/${keyword.id}`);
      const json = (await res.json()) as {
        ok?: boolean;
        keyword?: KeywordWithRanks;
      };
      if (res.ok && json.ok && json.keyword) {
        setRemote(json.keyword);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, keyword?.id]);

  useEffect(() => {
    if (!open || !keyword?.id) {
      return;
    }
    setRemote(null);
    void refresh();
  }, [open, keyword?.id, keyword?.latest?.captured_at, keyword?.ranks?.length, keyword?.latestPerCountry?.length, refresh]);

  useEffect(() => {
    setRange(30);
    setHistoryTab("rank");
  }, [keyword?.id]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const shortDateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  const ranksChrono = data?.ranks ?? [];
  const latest = data?.latest ?? null;
  const best = useMemo(() => bestRank(ranksChrono), [ranksChrono]);
  const avg30 = useMemo(() => averageRankLastDays(ranksChrono, 30), [ranksChrono]);
  const rankFmt = useMemo(() => ({ notInTop: tRankFmt("rankNotInTop") }), [tRankFmt]);
  const rankNotInTopExpl = tRankFmt("rankNotInTopTooltip");

  const appForKeyword = useMemo(() => {
    if (!data?.app_id) return undefined;
    return apps.find((a) => a.id === data.app_id);
  }, [apps, data?.app_id]);

  const rankMarketChips = useMemo(() => {
    const fromKw = data?.trackedCountryCodes;
    if (fromKw?.length) return fromKw;
    return countriesForKeywordRankChips({
      market: data?.market ?? "",
      targetCountries: appForKeyword?.target_countries ?? null,
    });
  }, [data?.market, data?.trackedCountryCodes, appForKeyword?.target_countries]);

  const countryLabel = useCallback(
    (code: SupportedCountryCode) => tCountrySel(`countries.${code}.label`),
    [tCountrySel],
  );

  const rankAuthenticityTitle = useMemo(() => {
    const primary = primaryMarketCode(data?.market ?? "");
    if (primary === "cn") {
      return tRankFmt("rankAuthenticityTooltipChina");
    }
    if (primary != null) {
      return tRankFmt("rankAuthenticityTooltip", { country: countryLabel(primary) });
    }
    return tRankFmt("rankTooltip");
  }, [data?.market, tRankFmt, countryLabel]);

  const chartSeries = useMemo(() => {
    const windowed = ranksInWindow(ranksChrono, range).filter(
      (r) =>
        r.rank != null && r.rank <= SERPER_RANK_NOT_IN_FIRST_PAGE,
    );
    return windowed.map((r) => ({
      captured_at: r.captured_at,
      rank: r.rank as number,
      label: shortDateFmt.format(new Date(r.captured_at)),
      country_code: r.country_code ?? null,
      source: r.source ?? null,
    }));
  }, [ranksChrono, range, shortDateFmt]);

  const lineTone = useMemo(() => trendTone(ranksChrono, range), [ranksChrono, range]);

  const lineColor =
    lineTone === "improved"
      ? "#34d399"
      : lineTone === "worse"
        ? "#fb7185"
        : "#71717a";

  const lineStrokeWidth = lineTone === "improved" ? 3 : 2.25;

  const regionalSeries = useMemo(() => {
    const rows = data?.regionalRanks;
    if (!rows?.length) {
      return {
        chartReady: false as const,
        pivoted: [] as Record<string, string | number>[],
        codes: [] as string[],
        pointsPerCode: {} as Record<string, number>,
      };
    }
    const cutoff = Date.now() - range * MS_DAY;
    const windowed = rows.filter((r) => new Date(r.captured_at).getTime() >= cutoff);
    const byCode = new Map<string, { instantMs: number; captured_at: string; rank: number }[]>();
    for (const r of windowed) {
      if (r.rank == null) continue;
      const instantMs = rankSnapshotInstantMs(r.captured_at);
      if (!Number.isFinite(instantMs)) continue;
      const list = byCode.get(r.country_code) ?? [];
      list.push({ instantMs, captured_at: r.captured_at, rank: r.rank });
      byCode.set(r.country_code, list);
    }
    const codes = [...byCode.keys()]
      .filter((c) => (byCode.get(c) ?? []).length >= 1)
      .sort((a, b) => a.localeCompare(b));
    if (codes.length < 1) {
      return {
        chartReady: false as const,
        pivoted: [] as Record<string, string | number>[],
        codes: [] as string[],
        pointsPerCode: {} as Record<string, number>,
      };
    }
    const pointsPerCode = Object.fromEntries(
      codes.map((c) => [c, (byCode.get(c) ?? []).length] as const),
    ) as Record<string, number>;
    const timeSet = new Set<number>();
    for (const c of codes) {
      for (const p of byCode.get(c) ?? []) timeSet.add(p.instantMs);
    }
    const sortedTimes = [...timeSet].sort((a, b) => a - b);
    const pivoted = sortedTimes.map((instantMs) => {
      const row: Record<string, string | number> = {
        captured_at: new Date(instantMs).toISOString(),
        label: shortDateFmt.format(new Date(instantMs)),
      };
      for (const code of codes) {
        const hit = (byCode.get(code) ?? []).find((p) => p.instantMs === instantMs);
        if (hit) row[code] = hit.rank;
      }
      return row;
    });
    return { chartReady: true as const, pivoted, codes, pointsPerCode };
  }, [data?.regionalRanks, range, shortDateFmt]);

  const sparseRegionalChart = !regionalSeries.chartReady;

  const headerTrend = trendTone(ranksChrono, 7);

  const tableRows = useMemo(() => {
    const sorted = [...ranksChrono].sort(
      (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime(),
    );
    return sorted.map((row, i) => {
      const older = sorted[i + 1];
      let deltaKind: "improved" | "worse" | "same" | "na" = "na";
      let deltaAbs: number | null = null;
      if (row.rank != null && older?.rank != null) {
        deltaAbs = Math.abs(row.rank - older.rank);
        if (row.rank < older.rank) deltaKind = "improved";
        else if (row.rank > older.rank) deltaKind = "worse";
        else deltaKind = "same";
      }
      return { row, older, deltaKind, deltaAbs };
    });
  }, [ranksChrono]);

  const emptyHistory = ranksChrono.length === 0;
  const sparseChart = chartSeries.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,900px)] overflow-y-auto border-white/[0.08] bg-[#0a0e14] p-0 text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_24px_80px_-24px_rgba(0,0,0,0.65)] duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 sm:max-w-3xl"
        overlayClassName="bg-black/75 backdrop-blur-md duration-300 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        closeButtonClassName="text-zinc-500 hover:text-white"
      >
        <div className="border-b border-white/[0.06] bg-gradient-to-b from-emerald-950/[0.12] to-transparent px-6 pb-5 pt-7 sm:px-8 sm:pb-6 sm:pt-8">
          <DialogHeader className="space-y-4 text-start">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-500/80">{t("panelTitle")}</p>
            <DialogTitle className="text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
              {keyword?.term ?? data?.term ?? ""}
            </DialogTitle>
            <DialogDescription className="text-start text-sm leading-relaxed text-zinc-400">
              {t("description")}
            </DialogDescription>
            {typeof data?.positionsSinceLastOptimization === "number" &&
            data.positionsSinceLastOptimization > 0 ? (
              <p className="text-sm font-medium text-emerald-400/95">
                {t("optimizationGainSince", { positions: data.positionsSinceLastOptimization })}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-zinc-500">{t("header.current")}</span>
                {latest?.rank != null ? (
                  <span
                    className="inline-flex items-center gap-1.5 font-mono text-lg font-semibold text-white"
                    title={
                      latest.rank >= SERPER_RANK_NOT_IN_FIRST_PAGE
                        ? rankNotInTopExpl
                        : rankAuthenticityTitle
                    }
                  >
                    {rankMarketChips.length > 0 ? (
                      <span className="inline-flex items-center gap-1" aria-hidden>
                        {rankMarketChips.map((c) => (
                          <span
                            key={c}
                            className="text-base leading-none"
                            title={countryLabel(c)}
                          >
                            {COUNTRY_FLAG_EMOJI[c]}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span>{formatRankForDisplay(latest.rank, rankFmt)}</span>
                    {headerTrend === "improved" ? (
                      <span className="inline-flex items-center text-emerald-400" title={tDelta("improved")}>
                        <ArrowUp className="size-4" aria-hidden />
                        <span className="sr-only">{tDelta("improved")}</span>
                      </span>
                    ) : headerTrend === "worse" ? (
                      <span className="inline-flex items-center text-rose-400/90" title={tDelta("worse")}>
                        <ArrowDown className="size-4" aria-hidden />
                        <span className="sr-only">{tDelta("worse")}</span>
                      </span>
                    ) : headerTrend === "same" ? (
                      <span className="inline-flex items-center text-zinc-500" title={tDelta("same")}>
                        <Minus className="size-4" aria-hidden />
                        <span className="sr-only">{tDelta("same")}</span>
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="font-mono text-zinc-500">—</span>
                )}
              </span>
              <span className="hidden text-zinc-700 sm:inline" aria-hidden>
                ·
              </span>
              <span>
                <span className="text-zinc-500">{t("header.best")}</span>{" "}
                <span
                  className="font-mono font-medium text-zinc-200"
                  title={
                    best != null && best >= SERPER_RANK_NOT_IN_FIRST_PAGE
                      ? rankNotInTopExpl
                      : undefined
                  }
                >
                  {best != null ? formatRankForDisplay(best, rankFmt) : "—"}
                </span>
              </span>
              <span className="hidden text-zinc-700 sm:inline" aria-hidden>
                ·
              </span>
              <span>
                <span className="text-zinc-500">{t("header.avg")}</span>{" "}
                <span className="font-mono font-medium text-zinc-200">
                  {avg30 != null ? `#${avg30.toFixed(1)}` : "—"}
                </span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">{t("rankNote")}</p>
            <p className="text-xs leading-relaxed text-zinc-500" role="note">
              {t("googleRankDirectionalNote")}
            </p>
            <p className="text-xs leading-relaxed text-emerald-200/75" role="note">
              {t("creditsNote")}
            </p>
          </DialogHeader>
        </div>

        <div className="space-y-8 px-6 py-6 sm:px-8 sm:py-7">
          <div
            className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3"
            role="tablist"
            aria-label={t("tabs.listAria")}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex w-full rounded-xl border border-white/[0.08] bg-[#060910] p-1 shadow-inner ring-1 ring-white/[0.03] sm:inline-flex sm:w-auto">
              <button
                type="button"
                role="tab"
                aria-selected={historyTab === "rank"}
                onClick={() => setHistoryTab("rank")}
                className={`w-1/2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:w-auto sm:px-4 ${
                  historyTab === "rank"
                    ? "bg-emerald-600 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_4px_14px_-4px_rgba(16,185,129,0.45)]"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {t("tabs.rankOverTime")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={historyTab === "regional"}
                onClick={() => setHistoryTab("regional")}
                className={`w-1/2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 sm:w-auto sm:px-4 ${
                  historyTab === "regional"
                    ? "bg-emerald-600 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_4px_14px_-4px_rgba(16,185,129,0.45)]"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {t("tabs.regionalTrend")}
              </button>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-zinc-500" role="note">
            {t("chartGoalNote")}
          </p>

          {historyTab === "rank" ? (
            <div
              key="history-rank"
              className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 space-y-8"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold tracking-tight text-zinc-200">{t("chart.title")}</p>
                  <p className="max-w-md text-xs leading-relaxed text-zinc-500">{t("chart.hint")}</p>
                </div>
                <div
                  className="flex shrink-0 rounded-xl border border-white/[0.08] bg-[#060910] p-1 shadow-inner ring-1 ring-white/[0.03]"
                  role="group"
                  aria-label={t("chart.rangeAria")}
                >
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRange(d)}
                      className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                        range === d
                          ? "bg-emerald-600 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_4px_14px_-4px_rgba(16,185,129,0.45)]"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {d === 7 ? t("chart.range7") : d === 14 ? t("chart.range14") : t("chart.range30")}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="relative min-h-[280px] w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-500/10 bg-gradient-to-b from-[#0c1219] via-[#080c12] to-[#05080c] p-4 pb-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 sm:pb-3"
                dir="ltr"
              >
                {lineTone === "improved" && !sparseChart ? (
                  <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(52,211,153,0.08),transparent_55%)]"
                    aria-hidden
                  />
                ) : null}
                {loading ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#0a0e14]/85 backdrop-blur-sm"
                    aria-busy
                  >
                    <p className="text-sm text-zinc-400">{t("loading")}</p>
                  </div>
                ) : null}
                {sparseChart && !loading ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
                    <p className="text-sm font-semibold text-zinc-200">
                      {emptyHistory ? t("emptyChart.title") : t("emptyChart.outsideRange")}
                    </p>
                    <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
                      {emptyHistory ? t("emptyChart.body") : t("emptyChart.outsideRangeHint")}
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartSeries} margin={{ top: 16, right: 8, left: 4, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.45} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "#3f3f46", strokeOpacity: 0.6 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        reversed
                        domain={["auto", "auto"]}
                        tick={{ fill: "#a1a1aa", fontSize: 12, fontWeight: 500 }}
                        tickLine={false}
                        axisLine={{ stroke: "#3f3f46", strokeOpacity: 0.6 }}
                        width={52}
                        tickFormatter={(v) =>
                          formatRankForDisplay(typeof v === "number" ? v : null, rankFmt)
                        }
                      />
                      <Tooltip
                        cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 4" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pl = payload[0]?.payload as {
                            captured_at?: string;
                            rank?: number;
                            country_code?: string | null;
                            source?: string | null;
                          };
                          if (pl?.rank == null) return null;
                          const at = pl.captured_at;
                          const cc = pl.country_code;
                          const marketLine =
                            cc && isSupportedCountry(cc)
                              ? countryLabel(cc)
                              : t("columns.marketLegacy");
                          return (
                            <div
                              className="rounded-xl border border-white/[0.08] px-3 py-2.5 text-sm shadow-xl"
                              style={{
                                backgroundColor: "#0f1419",
                                boxShadow: "0 12px 40px -12px rgba(0,0,0,0.5)",
                                color: "#f4f4f5",
                              }}
                            >
                              <p className="mb-1 text-[11px] text-zinc-400">
                                {at ? dateFmt.format(new Date(at)) : ""}
                              </p>
                              <p className="font-mono text-base font-semibold text-emerald-200/95">
                                {formatRankForDisplay(pl.rank, rankFmt)}
                              </p>
                              {pl.rank >= SERPER_RANK_NOT_IN_FIRST_PAGE ? (
                                <p className="mt-1 text-[11px] text-zinc-500">{rankNotInTopExpl}</p>
                              ) : null}
                              <p className="mt-1 text-xs text-zinc-400">{marketLine}</p>
                              {pl.source ? (
                                <p className="mt-1 text-[11px] text-zinc-500">
                                  {t("columns.sourceWithValue", { source: pl.source })}
                                </p>
                              ) : null}
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="rank"
                        stroke={lineColor}
                        strokeWidth={lineStrokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dot={{
                          r: lineTone === "improved" ? 4 : 3,
                          fill: lineColor,
                          strokeWidth: lineTone === "improved" ? 2 : 0,
                          stroke: lineTone === "improved" ? "#022c22" : lineColor,
                        }}
                        activeDot={{
                          r: 6,
                          stroke: lineTone === "improved" ? "#6ee7b7" : lineColor,
                          strokeWidth: 2,
                          fill: "#0a0e14",
                        }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ) : (
            <div
              key="history-regional"
              className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 space-y-8"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold tracking-tight text-zinc-200">{t("regionalChart.title")}</p>
                  <p className="max-w-md text-xs leading-relaxed text-zinc-500">{t("regionalChart.hint")}</p>
                </div>
                <div
                  className="flex shrink-0 rounded-xl border border-white/[0.08] bg-[#060910] p-1 shadow-inner ring-1 ring-white/[0.03]"
                  role="group"
                  aria-label={t("chart.rangeAria")}
                >
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRange(d)}
                      className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                        range === d
                          ? "bg-emerald-600 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_4px_14px_-4px_rgba(16,185,129,0.45)]"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {d === 7 ? t("chart.range7") : d === 14 ? t("chart.range14") : t("chart.range30")}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="relative min-h-[300px] w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-500/10 bg-gradient-to-b from-[#0c1219] via-[#080c12] to-[#05080c] p-4 pb-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 sm:pb-2"
                dir="ltr"
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_45%_at_50%_0%,rgba(16,185,129,0.06),transparent_55%)]"
                  aria-hidden
                />
                {loading ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#0a0e14]/85 backdrop-blur-sm"
                    aria-busy
                  >
                    <p className="text-sm text-zinc-400">{t("loading")}</p>
                  </div>
                ) : null}
                {sparseRegionalChart && !loading ? (
                  <div className="flex min-h-[300px] flex-col items-center justify-center px-5 text-center">
                    <p className="text-sm font-semibold text-zinc-200">{t("regionalChart.emptyTitle")}</p>
                    <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">{t("regionalChart.emptyBody")}</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={regionalSeries.pivoted}
                      margin={{ top: 16, right: 10, left: 4, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.45} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "#3f3f46", strokeOpacity: 0.6 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        reversed
                        domain={["auto", "auto"]}
                        tick={{ fill: "#a1a1aa", fontSize: 12, fontWeight: 500 }}
                        tickLine={false}
                        axisLine={{ stroke: "#3f3f46", strokeOpacity: 0.6 }}
                        width={52}
                        label={{
                          value: t("regionalChart.axisRank"),
                          angle: -90,
                          position: "insideLeft",
                          offset: 8,
                          fill: "#71717a",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                        tickFormatter={(v) =>
                          formatRankForDisplay(typeof v === "number" ? v : null, rankFmt)
                        }
                      />
                      <Tooltip
                        cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 4" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as { captured_at?: string } | undefined;
                          const at = row?.captured_at;
                          const entries = payload.filter(
                            (p) => p.dataKey != null && typeof p.value === "number",
                          );
                          if (entries.length === 0) return null;
                          return (
                            <div
                              className="rounded-xl border border-white/[0.08] px-3 py-2.5 text-sm shadow-xl"
                              style={{
                                backgroundColor: "#0f1419",
                                boxShadow: "0 12px 40px -12px rgba(0,0,0,0.5)",
                                color: "#f4f4f5",
                              }}
                            >
                              <p className="mb-2 text-[11px] text-zinc-400">
                                {at ? dateFmt.format(new Date(at)) : ""}
                              </p>
                              <ul className="space-y-1.5">
                                {entries.map((p) => {
                                  const code = String(p.dataKey);
                                  const codeLc = code.toLowerCase();
                                  const flag = isSupportedCountry(codeLc) ? COUNTRY_FLAG_EMOJI[codeLc] : "";
                                  const name = isSupportedCountry(codeLc)
                                    ? countryLabel(codeLc)
                                    : code.toUpperCase();
                                  const rankVal = p.value as number;
                                  const src = data?.regionalRanks?.find(
                                    (rr) =>
                                      rr.captured_at === at &&
                                      String(rr.country_code).toLowerCase() === codeLc,
                                  )?.source;
                                  return (
                                    <li
                                      key={code}
                                      className="flex min-w-[200px] flex-col gap-0.5"
                                    >
                                      <div className="flex min-w-[200px] items-center justify-between gap-6">
                                        <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                                          {flag ? <span className="text-base leading-none">{flag}</span> : null}
                                          <span>{name}</span>
                                        </span>
                                        <span className="font-mono text-sm font-medium text-emerald-200/95">
                                          {formatRankForDisplay(rankVal, rankFmt)}
                                        </span>
                                      </div>
                                      {rankVal >= SERPER_RANK_NOT_IN_FIRST_PAGE ? (
                                        <p className="ps-6 text-[10px] text-zinc-500">{rankNotInTopExpl}</p>
                                      ) : null}
                                      {src ? (
                                        <p className="ps-6 text-[10px] text-zinc-500">
                                          {t("columns.sourceWithValue", { source: src })}
                                        </p>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={56}
                        wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
                        formatter={(value) => (
                          <span className="inline-flex items-center gap-1 text-zinc-300">{value}</span>
                        )}
                      />
                      {regionalSeries.codes.map((code, i) => {
                        const color = REGIONAL_LINE_COLORS[i % REGIONAL_LINE_COLORS.length];
                        const nPts = regionalSeries.pointsPerCode[code] ?? 0;
                        const codeLc = code.toLowerCase();
                        const lineName =
                          isSupportedCountry(codeLc)
                            ? `${COUNTRY_FLAG_EMOJI[codeLc]} ${countryLabel(codeLc)}`
                            : code.toUpperCase();
                        return (
                        <Line
                          key={code}
                          type="monotone"
                          dataKey={code}
                          name={lineName}
                          stroke={color}
                          strokeWidth={2.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          dot={{ r: nPts === 1 ? 5 : 2.5, fill: color }}
                          activeDot={{
                            r: 5,
                            stroke: color,
                            strokeWidth: 2,
                            fill: "#0a0e14",
                          }}
                          connectNulls
                        />
                      );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-3.5 shadow-sm ring-1 ring-inset ring-white/[0.04] sm:px-5 sm:py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("cards.current")}</p>
              <p
                className="mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight text-white"
                title={
                  latest?.rank != null && latest.rank >= SERPER_RANK_NOT_IN_FIRST_PAGE
                    ? rankNotInTopExpl
                    : undefined
                }
              >
                {latest?.rank != null ? formatRankForDisplay(latest.rank, rankFmt) : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-b from-emerald-500/[0.06] to-transparent px-4 py-3.5 shadow-sm ring-1 ring-inset ring-emerald-500/10 sm:px-5 sm:py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-500/70">{t("cards.best")}</p>
              <p
                className="mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight text-emerald-300"
                title={
                  best != null && best >= SERPER_RANK_NOT_IN_FIRST_PAGE ? rankNotInTopExpl : undefined
                }
              >
                {best != null ? formatRankForDisplay(best, rankFmt) : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-3.5 shadow-sm ring-1 ring-inset ring-white/[0.04] sm:px-5 sm:py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("cards.avg30")}</p>
              <p className="mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight text-zinc-100">
                {avg30 != null ? `#${avg30.toFixed(1)}` : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-3.5 shadow-sm ring-1 ring-inset ring-white/[0.04] sm:px-5 sm:py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("cards.snapshots")}</p>
              <p className="mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight text-zinc-100">{ranksChrono.length}</p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold tracking-tight text-zinc-200">{t("tableTitle")}</p>
            {emptyHistory && !loading ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#060910]/80 px-5 py-12 text-center ring-1 ring-inset ring-white/[0.03]">
                <p className="text-sm font-medium text-zinc-400">{t("emptyTable")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#060910]/40 shadow-inner ring-1 ring-inset ring-white/[0.03]">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="bg-[#080c12] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-start font-medium">{t("columns.date")}</th>
                      <th className="px-4 py-3 text-end font-medium" title={t("rankNote")}>
                        {t("columns.rank")}
                      </th>
                      <th className="px-4 py-3 text-end font-medium">{t("columns.change")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ row, deltaKind, deltaAbs }) => (
                      <tr key={`${row.captured_at}-${row.rank ?? "x"}`} className="border-b border-white/[0.04]">
                        <td className="px-4 py-2.5 text-zinc-300">
                          {dateFmt.format(new Date(row.captured_at))}
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-emerald-200/90">
                          {row.rank != null ? (
                            <span
                              title={(() => {
                                const parts = [
                                  dateFmt.format(new Date(row.captured_at)),
                                  formatRankForDisplay(row.rank, rankFmt),
                                ];
                                if (row.rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) {
                                  parts.push(rankNotInTopExpl);
                                }
                                const ccRaw = (row as { country_code?: string | null }).country_code;
                                parts.push(
                                  ccRaw && isSupportedCountry(ccRaw)
                                    ? countryLabel(ccRaw)
                                    : t("columns.marketLegacy"),
                                );
                                const src = (row as { source?: string | null }).source;
                                if (src) parts.push(t("columns.sourceWithValue", { source: src }));
                                return parts.join("\n");
                              })()}
                            >
                              {formatRankForDisplay(row.rank, rankFmt)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-end font-mono text-xs">
                          {deltaKind === "na" ? (
                            <span className="text-zinc-600">—</span>
                          ) : deltaKind === "improved" ? (
                            <span className="inline-flex items-center justify-end gap-1 text-emerald-400">
                              <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                              {deltaAbs != null && deltaAbs > 0 ? `-${deltaAbs}` : t("change.same")}
                            </span>
                          ) : deltaKind === "worse" ? (
                            <span className="inline-flex items-center justify-end gap-1 text-rose-400/90">
                              <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                              {deltaAbs != null && deltaAbs > 0 ? `+${deltaAbs}` : t("change.same")}
                            </span>
                          ) : (
                            <span className="text-zinc-500">{t("change.same")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
