"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Tag,
  Users,
  MessageSquare,
  BarChart3,
  Palette,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PerformanceAttributionRow,
  PerformanceAttributionResponse,
} from "@/lib/performance/performance-attribution.types";
import { summarizeSignals } from "@/lib/performance/signal-efficacy";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  appId?: string | null;
  vaultLocale?: "en" | "ar";
  isRtl?: boolean;
  className?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null, suffix = "%", decimals = 2): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}${suffix}`;
}

function fmtAbs(n: number | null, suffix = "%", decimals = 2): string {
  if (n === null) return "—";
  return `${n.toFixed(decimals)}${suffix}`;
}

function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<
  PerformanceAttributionRow["efficacyTier"],
  { label: string; className: string; dotClass: string }
> = {
  strong: {
    label: "efficacyStrong",
    className: "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
    dotClass: "bg-emerald-400",
  },
  moderate: {
    label: "efficacyModerate",
    className: "bg-sky-500/10 border-sky-500/25 text-sky-300",
    dotClass: "bg-sky-400",
  },
  weak: {
    label: "efficacyWeak",
    className: "bg-zinc-500/10 border-zinc-500/25 text-zinc-400",
    dotClass: "bg-zinc-400",
  },
  negative: {
    label: "efficacyNegative",
    className: "bg-red-500/10 border-red-500/25 text-red-300",
    dotClass: "bg-red-400",
  },
  insufficient: {
    label: "efficacyInsufficient",
    className: "bg-zinc-800/60 border-zinc-700/25 text-zinc-500",
    dotClass: "bg-zinc-600",
  },
};

const VERSION_STATUS_COLORS: Record<string, string> = {
  draft: "text-amber-400",
  published: "text-sky-400",
  deployed: "text-emerald-400",
};

// ─── CVR delta chip ────────────────────────────────────────────────────────────

function DeltaChip({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <span className="flex items-center gap-1 text-zinc-500 text-xs">
        <Minus className="w-3 h-3" />
        —
      </span>
    );
  }
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-semibold tabular-nums",
        positive ? "text-emerald-400" : "text-red-400",
      )}
      title={label}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmt(value)}
    </span>
  );
}

// ─── Signal chip strip ────────────────────────────────────────────────────────

function SignalChips({
  row,
  t,
}: {
  row: PerformanceAttributionRow;
  t: ReturnType<typeof useTranslations<"optimizer.performanceAttribution">>;
}) {
  const s = summarizeSignals(row.signals);

  return (
    <div className="flex flex-wrap gap-1">
      {s.keywordCount > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 text-[10px] font-medium">
          <Tag className="w-2.5 h-2.5" />
          {s.keywordCount} {t("signalKeywords")}
        </span>
      )}
      {s.competitorCount > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 px-2 py-0.5 text-[10px] font-medium">
          <Users className="w-2.5 h-2.5" />
          {s.competitorCount} {t("signalCompetitors")}
        </span>
      )}
      {s.reviewPainCount > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-300 px-2 py-0.5 text-[10px] font-medium">
          <MessageSquare className="w-2.5 h-2.5" />
          {s.reviewPainCount} {t("signalPains")}
        </span>
      )}
      {s.marketGapCount > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-medium">
          <BarChart3 className="w-2.5 h-2.5" />
          {s.marketGapCount} {t("signalGaps")}
        </span>
      )}
      {s.hasBrandKit && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 px-2 py-0.5 text-[10px] font-medium">
          <Palette className="w-2.5 h-2.5" />
          {t("signalBrandKit")}
        </span>
      )}
      {s.keywordCount === 0 &&
        s.competitorCount === 0 &&
        s.reviewPainCount === 0 &&
        s.marketGapCount === 0 &&
        !s.hasBrandKit && (
          <span className="text-zinc-600 text-xs">{t("noSignals")}</span>
        )}
    </div>
  );
}

// ─── Expanded metrics row ─────────────────────────────────────────────────────

function MetricsExpanded({
  row,
  t,
}: {
  row: PerformanceAttributionRow;
  t: ReturnType<typeof useTranslations<"optimizer.performanceAttribution">>;
}) {
  if (!row.performance) {
    return (
      <p className="text-xs text-zinc-500 px-4 py-3">{t("noMetricsData")}</p>
    );
  }

  const p = row.performance;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-t border-white/6">
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("metricImpressions")}</p>
        <p className="text-sm font-semibold text-zinc-200 tabular-nums">{fmtCount(p.totalImpressions)}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("metricInstallers")}</p>
        <p className="text-sm font-semibold text-zinc-200 tabular-nums">{fmtCount(p.totalInstallers)}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("metricAvgCvr")}</p>
        <p className="text-sm font-semibold text-zinc-200 tabular-nums">{fmtAbs(p.avgConversionRate)}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("metricAvgCtr")}</p>
        <p className="text-sm font-semibold text-zinc-200 tabular-nums">{fmtAbs(p.avgCtr)}</p>
      </div>
      {row.signals?.keywordTracker.highConfidenceKeywords.slice(0, 5).length ? (
        <div className="col-span-full flex flex-col gap-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("topKeywordsLabel")}</p>
          <div className="flex flex-wrap gap-1">
            {row.signals.keywordTracker.highConfidenceKeywords.slice(0, 5).map((kw) => (
              <span
                key={kw}
                className="rounded bg-violet-500/10 border border-violet-500/15 text-violet-300 px-1.5 py-0.5 text-[10px]"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Attribution row ─────────────────────────────────────────────────────────

function AttributionRow({
  row,
  t,
  isRtl,
}: {
  row: PerformanceAttributionRow;
  t: ReturnType<typeof useTranslations<"optimizer.performanceAttribution">>;
  isRtl: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_CONFIG[row.efficacyTier];
  const statusColor = VERSION_STATUS_COLORS[row.version.status] ?? "text-zinc-400";

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden transition-colors hover:border-white/12">
      {/* Main row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "w-full grid items-center gap-3 px-4 py-3.5 text-left",
          isRtl ? "text-right" : "text-left",
        )}
        style={{
          gridTemplateColumns: "minmax(0,2fr) minmax(0,3fr) repeat(3, minmax(0,1fr)) minmax(0,1.5fr) 24px",
        }}
      >
        {/* Version + status */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-semibold text-zinc-200 truncate">
            {t("versionLabel", { number: row.version.versionNumber })}
          </p>
          <p className={cn("text-[11px] font-medium capitalize", statusColor)}>
            {row.version.status}
          </p>
          {row.version.title && (
            <p className="text-[10px] text-zinc-500 truncate italic">{row.version.title}</p>
          )}
        </div>

        {/* Signal chips */}
        <div className="min-w-0 overflow-hidden">
          <SignalChips row={row} t={t} />
        </div>

        {/* Deployment date */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("colDeployDate")}</p>
          <p className="text-xs text-zinc-300 tabular-nums whitespace-nowrap">
            {formatDate(row.version.deployedAt)}
          </p>
        </div>

        {/* CVR delta */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("colCvrDelta")}</p>
          <DeltaChip value={row.cvrDelta} label={t("cvrDeltaLabel")} />
        </div>

        {/* Signal Efficacy */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("colEfficacy")}</p>
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium w-fit",
              tier.className,
            )}
            title={
              row.signalEfficacyScore !== null
                ? `${t("efficacyScoreLabel")}: ${row.signalEfficacyScore.toFixed(4)}`
                : undefined
            }
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", tier.dotClass)} />
            {t(tier.label as Parameters<typeof t>[0])}
            {row.signalEfficacyScore !== null && (
              <span className="opacity-60">({row.signalEfficacyScore.toFixed(3)})</span>
            )}
          </div>
        </div>

        {/* Efficacy score raw */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t("colScore")}</p>
          <p className="text-xs font-mono text-zinc-300">
            {row.signalEfficacyScore !== null
              ? row.signalEfficacyScore.toFixed(4)
              : "—"}
          </p>
        </div>

        {/* Expand toggle */}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
      </button>

      {/* Expanded metrics */}
      {expanded && <MetricsExpanded row={row} t={t} />}
    </div>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────

function TableHeader({
  t,
  isRtl,
}: {
  t: ReturnType<typeof useTranslations<"optimizer.performanceAttribution">>;
  isRtl: boolean;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-3 px-4 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500",
        isRtl ? "text-right" : "text-left",
      )}
      style={{
        gridTemplateColumns: "minmax(0,2fr) minmax(0,3fr) repeat(3, minmax(0,1fr)) minmax(0,1.5fr) 24px",
      }}
    >
      <span>{t("colVersion")}</span>
      <span>{t("colUsedSignals")}</span>
      <span>{t("colDeployDate")}</span>
      <span>{t("colCvrDelta")}</span>
      <span>{t("colEfficacy")}</span>
      <span>{t("colScore")}</span>
      <span />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PerformanceAttributionTable({
  workspaceId,
  appId,
  vaultLocale = "en",
  isRtl = false,
  className,
}: Props) {
  const t = useTranslations("optimizer.performanceAttribution");

  const [rows, setRows] = useState<PerformanceAttributionRow[]>([]);
  const [totalVersions, setTotalVersions] = useState(0);
  const [versionsWithMetrics, setVersionsWithMetrics] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttribution = useCallback(
    async (syncMetrics = false) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(
          `/api/workspaces/${workspaceId}/performance-attribution`,
          window.location.origin,
        );
        if (appId) url.searchParams.set("appId", appId);
        url.searchParams.set("locale", vaultLocale);
        url.searchParams.set("limit", "20");
        if (syncMetrics) url.searchParams.set("syncMetrics", "1");

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as PerformanceAttributionResponse;
        if (!json.ok) throw new Error("API error");

        setRows(json.rows);
        setTotalVersions(json.totalVersions);
        setVersionsWithMetrics(json.versionsWithMetrics);
      } catch (e) {
        setError(t("loadError"));
        console.error("[PerformanceAttributionTable] fetch failed", e);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, appId, vaultLocale, t],
  );

  useEffect(() => {
    fetchAttribution();
  }, [fetchAttribution]);

  return (
    <div className={cn("flex flex-col gap-4", className)} dir={isRtl ? "rtl" : "ltr"}>
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{t("panelTitle")}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{t("panelSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && versionsWithMetrics > 0 && (
            <p className="text-xs text-zinc-500 hidden sm:block">
              {t("metricsCount", { count: versionsWithMetrics, total: totalVersions })}
            </p>
          )}
          <button
            onClick={() => fetchAttribution(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/8 hover:border-white/15 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {t("syncButton")}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Zap className="w-3 h-3 text-violet-400" />
          {t("legendEfficacy")}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          {t("legendCvr")}
        </span>
      </div>

      {/* State: loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t("loading")}</span>
        </div>
      )}

      {/* State: error */}
      {!loading && error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* State: empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/8 py-12 text-center">
          <BarChart3 className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-400">{t("emptyState")}</p>
          <p className="text-xs text-zinc-600 mt-1">{t("emptyHint")}</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <TableHeader t={t} isRtl={isRtl} />
          {rows.map((row) => (
            <AttributionRow key={row.version.id} row={row} t={t} isRtl={isRtl} />
          ))}
        </div>
      )}

      {/* Play Store API hint (shown when no metric data) */}
      {!loading && !error && rows.length > 0 && versionsWithMetrics === 0 && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/6 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-300">{t("noMetricsHintTitle")}</p>
            <p className="text-xs text-amber-400/70 mt-0.5">{t("noMetricsHintBody")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
