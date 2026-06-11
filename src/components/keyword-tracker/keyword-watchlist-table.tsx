"use client";

import { Flame, Info, Loader2, RefreshCw, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { KeywordWatchlistTableSkeleton } from "@/components/keyword-tracker/keyword-watchlist-table-skeleton";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  COUNTRY_FLAG_EMOJI,
  type SupportedCountryCode,
} from "@/lib/countries";
import { formatRankForDisplay } from "@/lib/keywords/format-rank-display";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import { competitorInitialForDisplay } from "@/lib/keywords/serper-snapshot-rank-resolve";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { FlatKeywordRow } from "@/lib/keywords/flatten-keyword-rows";
import type { TrackedCompetitorRankSnapshot } from "@/lib/keywords/tracked-competitor-ranks";
import {
  formatCapturedAgo,
  getRankFreshness,
} from "@/lib/keywords/flatten-keyword-rows";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type CompetitorSlot = {
  name: string;
  packageId: string;
  /** App icon URL from workspace_competitor_analyses.icon_url — may be null. */
  iconUrl?: string | null;
  rankByTerm: ReadonlyMap<string, number>;
};

function resolveTrackedCompetitorRank(
  packageId: string,
  termKey: string,
  snapshotRanks: TrackedCompetitorRankSnapshot[],
  rankByTerm: ReadonlyMap<string, number>,
): number | null {
  const pkgNorm = packageId.trim().toLowerCase();
  const fromSnapshot = snapshotRanks.find((r) => r.package_name === pkgNorm);
  // When a serper refresh wrote competitor ranks for this row, trust that snapshot
  // exclusively — do not fall back to unrelated SERP overlap from Competitor Spy.
  if (snapshotRanks.length > 0) {
    return fromSnapshot?.rank ?? null;
  }
  return rankByTerm.get(termKey) ?? null;
}

function TrackedCompetitorsCell({
  slots,
  termKey,
  snapshotRanks,
  rankFmt,
  tooltipTemplate,
  notRankedTooltip,
  emptyHint,
  isRtl,
}: {
  slots: [CompetitorSlot | null, CompetitorSlot | null];
  termKey: string;
  snapshotRanks: TrackedCompetitorRankSnapshot[];
  rankFmt: { notInTop: string };
  tooltipTemplate: (name: string, rank: number | null, packageId: string) => string;
  notRankedTooltip: string;
  emptyHint: string;
  isRtl?: boolean;
}) {
  const active = slots.filter((s): s is CompetitorSlot => s != null);
  if (active.length === 0) {
    return (
      <span
        className={cn(
          "mx-auto block max-w-[200px] text-center text-[11px] leading-snug text-zinc-500",
          isRtl && "font-arabic leading-relaxed",
        )}
      >
        {emptyHint}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-end justify-center gap-3",
        isRtl && "flex-row-reverse font-arabic",
      )}
    >
      {active.map((slot) => {
        const rank = resolveTrackedCompetitorRank(
          slot.packageId,
          termKey,
          snapshotRanks,
          slot.rankByTerm,
        );
        const ranked = rank != null && rank < SERPER_RANK_NOT_IN_FIRST_PAGE;
        const displayName =
          slot.name.trim() || slot.packageId;
        const initial = competitorInitialForDisplay(displayName, slot.packageId);
        const iconUrl =
          slot.iconUrl?.trim() ||
          `https://icon.horse/icon/${encodeURIComponent(slot.packageId)}`;
        return (
          <div key={slot.packageId} className="flex min-w-[2rem] flex-col items-center gap-1">
            <Tooltip
              content={
                <span className="block max-w-[240px] leading-snug text-zinc-200">
                  {tooltipTemplate(slot.name, rank, slot.packageId)}
                </span>
              }
              side="top"
              className="max-w-[280px] border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
              asChild
            >
              <div
                className={cn(
                  "relative size-7 shrink-0 cursor-default overflow-hidden rounded-md",
                  "border border-zinc-700/80 bg-zinc-800/60 ring-1 ring-white/[0.04]",
                )}
                tabIndex={0}
                aria-label={tooltipTemplate(slot.name, rank, slot.packageId)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={iconUrl}
                  alt={slot.name}
                  className="size-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const fb = (e.currentTarget as HTMLImageElement)
                      .nextElementSibling as HTMLElement | null;
                    if (fb) fb.style.display = "flex";
                  }}
                />
                <span
                  className="absolute inset-0 hidden items-center justify-center text-[9px] font-bold uppercase text-zinc-400"
                  aria-hidden
                >
                  {initial}
                </span>
              </div>
            </Tooltip>
            {ranked ? (
              <span className="font-mono text-[10px] font-semibold tabular-nums text-amber-300/95">
                {formatRankForDisplay(rank, rankFmt, { column: "theirs" })}
              </span>
            ) : (
              <Tooltip
                content={<span className="text-zinc-400">{notRankedTooltip}</span>}
                side="bottom"
                className="border border-white/[0.12] bg-[#0a0d12] px-2 py-1 text-xs shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                asChild
              >
                <span className="cursor-default font-mono text-[10px] font-medium text-zinc-600">
                  {rankFmt.notInTop}
                </span>
              </Tooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NotInTopRankWithHint({
  rank,
  rankFmt,
  detailTooltip,
}: {
  rank: number | null;
  rankFmt: { notInTop: string };
  detailTooltip: string;
}) {
  const notInTop = rank != null && rank >= SERPER_RANK_NOT_IN_FIRST_PAGE;
  return (
    <span className="inline-flex items-center gap-1">
      <span>{formatRankForDisplay(rank, rankFmt)}</span>
      {notInTop ? (
        <Tooltip
          content={
            <span className="block leading-snug text-zinc-200">{detailTooltip}</span>
          }
          side="top"
          className="max-w-[280px] border border-white/[0.12] bg-[#0a0d12] px-3 py-2 text-xs leading-relaxed text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.04]"
          asChild
        >
          <button
            type="button"
            className="inline-flex shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            aria-label={detailTooltip}
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        </Tooltip>
      ) : null}
    </span>
  );
}

export type KeywordWatchlistTableProps = {
  /** One row per (keyword × country) — produced by flattenKeywordsToRows(). */
  rows: FlatKeywordRow[];
  totalFilteredCount: number;
  page: number;
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: (typeof PAGE_SIZE_OPTIONS)[number]) => void;
  appNameById: ReadonlyMap<string, string>;
  filterAppId: string | "all";
  showSkeleton: boolean;
  blockingError: boolean;
  mutationPending: boolean;
  serperRowRefreshId: string | null;
  countryLabel: (code: SupportedCountryCode) => string;
  onHistory: (row: KeywordWithRanks) => void;
  onDelete: (id: string) => void;
  onSerperRefresh: (id: string) => void;
  /** Dual competitor slots — up to two competitors with their rank maps. */
  competitorSlots?: [CompetitorSlot | null, CompetitorSlot | null];
  /** Arabic dashboard — RTL layout + typography for competitor column. */
  isRtl?: boolean;
};

export function KeywordWatchlistTable({
  rows,
  totalFilteredCount,
  page,
  pageSize,
  pageCount,
  onPageChange,
  onPageSizeChange,
  appNameById,
  filterAppId,
  showSkeleton,
  blockingError,
  mutationPending,
  serperRowRefreshId,
  countryLabel,
  onHistory,
  onDelete,
  onSerperRefresh,
  competitorSlots,
  isRtl = false,
}: KeywordWatchlistTableProps) {
  const t = useTranslations("keywordTracker");

  const rangeStart = totalFilteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalFilteredCount);

  return (
    <TooltipProvider>
    <div className="flex flex-col">
      <div className="max-h-[min(70vh,720px)] overflow-auto overscroll-contain">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-start text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {/* 1 — Keyword (left-aligned) */}
              <th className="sticky top-0 z-10 bg-[#0c1018] px-5 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.keyword")}
              </th>
              {/* 2 — Market (center-aligned) */}
              <th className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 text-center shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.market")}
              </th>
              {/* 3 — Your Rank (center-aligned) */}
              <th
                className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 text-center shadow-[0_1px_0_0_rgba(255,255,255,0.06)]"
                title={t("table.rankTooltip")}
              >
                {t("table.bestRank")}
              </th>
              {/* 4 — My competitors (center-aligned) */}
              <th className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 text-center shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.myCompetitors")}
              </th>
              {/* 5 — Actions (right-aligned) */}
              <th className="sticky top-0 z-10 bg-[#0c1018] px-5 py-3.5 text-end shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.actions")}
              </th>
            </tr>
          </thead>
          {showSkeleton ? (
            <KeywordWatchlistTableSkeleton />
          ) : (
            <tbody>
              {rows.map((row) => {
                const src = row.source;
                const rankFmt = { notInTop: t("table.rankNotInTop") };
                const rankDetailHint = t("table.rankNotInTopDetailTooltip", {
                  appName: appNameById.get(src.app_id) ?? src.app_id,
                });

                // Your Rank: flat row holds per-country rank value + capturedAt timestamp.
                const yourRank = row.yourRank;
                const freshness = getRankFreshness(row.capturedAt);
                const isStale = freshness === "stale";
                const isBrandNew = freshness === "new";

                return (
                  <tr
                    key={row.key}
                    className="border-b border-white/[0.06] transition-colors hover:bg-white/[0.03]"
                  >
                    {/* 1 — Keyword */}
                    <td className="px-5 py-4 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-start text-[15px] font-semibold text-emerald-300/95 underline-offset-4 hover:text-emerald-200 hover:underline"
                          onClick={() => onHistory(src)}
                        >
                          {src.term}
                        </button>
                        {src.recentRankGainBadge != null ? (
                          <span
                            className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500/20 px-2 text-[11px] font-bold tabular-nums text-emerald-300 ring-1 ring-emerald-500/35"
                            title={t("table.rankGainBadgeTooltip", {
                              positions: src.recentRankGainBadge,
                            })}
                          >
                            +{src.recentRankGainBadge}
                          </span>
                        ) : null}
                      </div>
                      {filterAppId === "all" ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          {appNameById.get(src.app_id) ?? src.app_id}
                        </p>
                      ) : null}
                    </td>

                    {/* 2 — Market: single flag + country code badge */}
                    <td className="px-4 py-4 text-center align-middle">
                      <span
                        className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                        title={countryLabel(row.country)}
                      >
                        <span aria-hidden>{COUNTRY_FLAG_EMOJI[row.country]}</span>
                        <span>{row.country.toUpperCase()}</span>
                      </span>
                    </td>

                    {/* 3 — Your Rank (per-country value; faded when stale) */}
                    <td className="px-4 py-4 text-center align-middle font-mono text-zinc-100">
                      {yourRank != null ? (
                        <span className={cn(isStale && "opacity-60")}>
                          <NotInTopRankWithHint
                            rank={yourRank}
                            rankFmt={rankFmt}
                            detailTooltip={rankDetailHint}
                          />
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>

                    {/* 4 — My competitors: Competitor Spy slots only */}
                    <td className="px-4 py-4 text-center align-middle">
                      <TrackedCompetitorsCell
                        slots={competitorSlots ?? [null, null]}
                        termKey={src.term.trim().toLowerCase()}
                        snapshotRanks={row.trackedCompetitors}
                        rankFmt={rankFmt}
                        tooltipTemplate={(name, rank, packageId) =>
                          t("table.trackedCompetitorTooltip", {
                            name,
                            rank:
                              rank != null
                                ? formatRankForDisplay(rank, rankFmt, { column: "theirs" })
                                : rankFmt.notInTop,
                            package: packageId,
                          })
                        }
                        notRankedTooltip={t("table.competitorNotRankedTooltip")}
                        emptyHint={t("table.addCompetitorsHint")}
                        isRtl={isRtl}
                      />
                    </td>

                    {/* 5 — Actions: icon-only compact buttons */}
                    <td className="px-5 py-4 align-middle">
                      <div className="flex flex-col items-end">

                        {/* Button row — all icons in a strict horizontal line */}
                        <div className="flex items-center gap-2">

                          {/* ── Fetch / Refresh icon button (3 states) ── */}
                          {serperRowRefreshId === src.id ? (
                            /* Actively syncing — animated spinner, not clickable */
                            <span
                              className="flex size-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950"
                              aria-label={t("actions.syncingPlayStore")}
                            >
                              <Loader2 className="size-4 animate-spin text-emerald-400/80" aria-hidden />
                            </span>
                          ) : (
                            <>
                              {/* State A — Brand New: yellow lightning bolt */}
                              {isBrandNew && (
                                <Tooltip
                                  content={
                                    <span className="leading-snug text-zinc-200">
                                      Fetch Live Rank ({AI_CREDIT_COSTS.serper_preview_per_country} AI credit)
                                    </span>
                                  }
                                  side="top"
                                  className="border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                                  asChild
                                >
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex size-8 shrink-0 items-center justify-center rounded-xl",
                                      "border border-zinc-800 bg-zinc-950 transition-all",
                                      "hover:border-emerald-500/40 hover:bg-zinc-900 hover:shadow-[0_0_12px_-3px_rgba(52,211,153,0.4)]",
                                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                                      "disabled:cursor-not-allowed disabled:opacity-40",
                                    )}
                                    disabled={blockingError || mutationPending || serperRowRefreshId != null}
                                    onClick={() => onSerperRefresh(src.id)}
                                    aria-label="Fetch Live Rank"
                                  >
                                    <Zap className="size-3.5 text-yellow-400" aria-hidden />
                                  </button>
                                </Tooltip>
                              )}

                              {/* State B — Fresh: sync icon */}
                              {freshness === "fresh" && (
                                <Tooltip
                                  content={
                                    <span className="block max-w-[240px] leading-snug text-zinc-200">
                                      Force Refresh ({AI_CREDIT_COSTS.serper_preview_per_country} AI credit) — data is
                                      fresh but you can re-query if you recently updated your app&apos;s metadata.
                                    </span>
                                  }
                                  side="top"
                                  className="max-w-[260px] border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                                  asChild
                                >
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex size-8 shrink-0 items-center justify-center rounded-xl",
                                      "border border-zinc-800 bg-zinc-950 transition-all",
                                      "hover:border-zinc-600 hover:bg-zinc-900",
                                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50",
                                      "disabled:cursor-not-allowed disabled:opacity-40",
                                    )}
                                    disabled={blockingError || mutationPending || serperRowRefreshId != null}
                                    onClick={() => onSerperRefresh(src.id)}
                                    aria-label="Force Refresh"
                                  >
                                    <RefreshCw className="size-3.5 text-zinc-400" aria-hidden />
                                  </button>
                                </Tooltip>
                              )}

                              {/* State C — Stale: amber flame icon */}
                              {isStale && (
                                <Tooltip
                                  content={
                                    <span className="leading-snug text-zinc-200">
                                      Update Metrics ({AI_CREDIT_COSTS.serper_preview_per_country} AI credit) — data is stale
                                    </span>
                                  }
                                  side="top"
                                  className="border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                                  asChild
                                >
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex size-8 shrink-0 items-center justify-center rounded-xl",
                                      "border border-amber-500/30 bg-zinc-950 transition-all",
                                      "hover:border-amber-500/60 hover:bg-amber-500/10 hover:shadow-[0_0_12px_-3px_rgba(245,158,11,0.4)]",
                                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
                                      "disabled:cursor-not-allowed disabled:opacity-40",
                                    )}
                                    disabled={blockingError || mutationPending || serperRowRefreshId != null}
                                    onClick={() => onSerperRefresh(src.id)}
                                    aria-label="Update Metrics"
                                  >
                                    <Flame className="size-3.5 text-amber-400" aria-hidden />
                                  </button>
                                </Tooltip>
                              )}
                            </>
                          )}

                          {/* View History — icon button */}
                          <Tooltip
                            content={<span className="text-zinc-200">{t("actions.viewHistory")}</span>}
                            side="top"
                            className="border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                            asChild
                          >
                            <button
                              type="button"
                              className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                              onClick={() => onHistory(src)}
                              aria-label={t("actions.viewHistory")}
                            >
                              <Info className="size-3.5" aria-hidden />
                            </button>
                          </Tooltip>

                          {/* Delete — icon button */}
                          <Tooltip
                            content={<span className="text-zinc-200">{t("actions.delete")}</span>}
                            side="top"
                            className="border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                            asChild
                          >
                            <button
                              type="button"
                              className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 transition-all hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                              onClick={() => onDelete(src.id)}
                              aria-label={t("actions.delete")}
                            >
                              <svg className="size-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 004.5 14h7a.5.5 0 00.497-.5L13 4" />
                              </svg>
                            </button>
                          </Tooltip>

                        </div>

                        {/* Timestamp — always below the button row, never inside it */}
                        {row.capturedAt && (freshness === "fresh" || isStale) ? (
                          <span className="mt-1 block w-full text-center text-[10px] text-zinc-500">
                            {formatCapturedAgo(row.capturedAt)}
                          </span>
                        ) : null}

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {!showSkeleton && totalFilteredCount > 0 ? (
        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-zinc-500">
            {t("table.showingRange", {
              from: rangeStart,
              to: rangeEnd,
              total: totalFilteredCount,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
              <span>{t("table.rowsPerPage")}</span>
              <select
                value={pageSize}
                onChange={(e) =>
                  onPageSizeChange(
                    Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                  )
                }
                className="h-9 rounded-md border border-white/[0.1] bg-[#070a0f] px-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="h-9 border-white/[0.1] bg-transparent text-zinc-300 hover:bg-white/[0.05]"
              >
                {t("table.prevPage")}
              </Button>
              <span className="min-w-[7rem] text-center text-xs tabular-nums text-zinc-400">
                {t("table.pageOf", { page, total: pageCount })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => onPageChange(page + 1)}
                className="h-9 border-white/[0.1] bg-transparent text-zinc-300 hover:bg-white/[0.05]"
              >
                {t("table.nextPage")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </TooltipProvider>
  );
}
