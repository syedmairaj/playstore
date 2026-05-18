"use client";

import { Info, Loader2, RefreshCw } from "lucide-react";
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
import { isKeywordRankSyncPending } from "@/lib/keywords/keyword-rank-sync-pending";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { FlatKeywordRow } from "@/lib/keywords/flatten-keyword-rows";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function RankSyncingPlaceholder({ label }: { label: string }) {
  return (
    <span className="inline-flex animate-pulse items-center gap-1.5 text-sm text-zinc-400">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-400/80" aria-hidden />
      <span>{label}</span>
    </span>
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
  /** Map of lowercased keyword term → competitor's rank for that term. */
  competitorRankByTerm?: ReadonlyMap<string, number>;
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
  competitorRankByTerm,
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
              {/* 4 — Competitor Rank (center-aligned) */}
              <th className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 text-center shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.competitorRank")}
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
                const pendingInitialSync = isKeywordRankSyncPending(src);
                const rankDetailHint = t("table.rankNotInTopDetailTooltip", {
                  appName: appNameById.get(src.app_id) ?? src.app_id,
                });

                // Your Rank: flat row already holds the per-country rank value.
                const yourRank = row.yourRank;

                // Competitor Rank: looked up by term (market-agnostic lookup, best-effort).
                const compRank =
                  competitorRankByTerm?.get(src.term.trim().toLowerCase()) ?? null;

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

                    {/* 3 — Your Rank (per-country value from flat row) */}
                    <td className="px-4 py-4 text-center align-middle font-mono text-zinc-100">
                      {pendingInitialSync ? (
                        <RankSyncingPlaceholder label={t("table.rankSyncing")} />
                      ) : yourRank != null ? (
                        <NotInTopRankWithHint
                          rank={yourRank}
                          rankFmt={rankFmt}
                          detailTooltip={rankDetailHint}
                        />
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>

                    {/* 4 — Competitor Rank */}
                    <td className="px-4 py-4 text-center align-middle font-mono text-amber-300/90">
                      {compRank != null ? (
                        <NotInTopRankWithHint
                          rank={compRank}
                          rankFmt={rankFmt}
                          detailTooltip={t("table.rankTooltip")}
                        />
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>

                    {/* 5 — Actions */}
                    <td className="px-5 py-4 align-middle">
                      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "gap-1.5 text-emerald-300/90 hover:bg-emerald-500/10 hover:text-emerald-200",
                            serperRowRefreshId === src.id && "pointer-events-none",
                          )}
                          title={t("actions.refreshSerperHint", {
                            per: AI_CREDIT_COSTS.serper_preview_per_country,
                          })}
                          disabled={
                            blockingError ||
                            mutationPending ||
                            (serperRowRefreshId != null &&
                              serperRowRefreshId !== src.id)
                          }
                          aria-busy={serperRowRefreshId === src.id}
                          onClick={() => onSerperRefresh(src.id)}
                        >
                          {serperRowRefreshId === src.id ? (
                            <Loader2
                              className="size-4 shrink-0 animate-spin text-emerald-200"
                              aria-hidden
                            />
                          ) : (
                            <RefreshCw className="size-3.5 shrink-0" aria-hidden />
                          )}
                          {serperRowRefreshId === src.id
                            ? t("actions.syncingPlayStore")
                            : t("actions.refreshSerper")}
                        </Button>
                        <span className="text-zinc-600" aria-hidden>
                          ·
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-emerald-300/90 hover:bg-emerald-500/10 hover:text-emerald-200"
                          onClick={() => onHistory(src)}
                        >
                          {t("actions.viewHistory")}
                        </Button>
                        <span className="text-zinc-600" aria-hidden>
                          ·
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"
                          onClick={() => onDelete(src.id)}
                        >
                          {t("actions.delete")}
                        </Button>
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
