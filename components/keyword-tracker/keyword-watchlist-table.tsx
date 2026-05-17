"use client";

import { ArrowDown, ArrowUp, Info, Loader2, Minus, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { KeywordWatchlistTableSkeleton } from "@/components/keyword-tracker/keyword-watchlist-table-skeleton";
import {
  COUNTRY_FLAG_EMOJI,
  countriesForKeywordRankChips,
  primaryMarketCode,
  type SupportedCountryCode,
} from "@/lib/countries";
import { formatRelativePastSince } from "@/lib/intl/format-relative-past";
import { formatRankForDisplay } from "@/lib/keywords/format-rank-display";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import { isKeywordRankSyncPending } from "@/lib/keywords/keyword-rank-sync-pending";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import { cn } from "@/lib/utils";

const MS_7D = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function isPendingInitialRankSync(row: KeywordWithRanks): boolean {
  return isKeywordRankSyncPending(row);
}

function RankSyncingPlaceholder({ label }: { label: string }) {
  return (
    <span className="inline-flex animate-pulse items-center gap-1.5 text-sm text-zinc-400">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-400/80" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

function bestRankFromRanks(ranks: { rank: number | null }[]): number | null {
  const nums = ranks
    .map((r) => r.rank)
    .filter(
      (n): n is number =>
        n != null && n <= SERPER_RANK_NOT_IN_FIRST_PAGE,
    );
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

function trendWindowRanks(
  ranksChronological: { rank: number | null; captured_at: string }[],
): number[] {
  const organic = (r: { rank: number | null }) =>
    r.rank != null && r.rank < SERPER_RANK_NOT_IN_FIRST_PAGE;
  const now = Date.now();
  const inWindow = ranksChronological.filter((r) => {
    if (!organic(r)) return false;
    return now - new Date(r.captured_at).getTime() <= MS_7D;
  });
  const values = inWindow.map((r) => r.rank as number);
  if (values.length >= 2) return values.slice(-7);
  const fallback = ranksChronological.filter(organic).map((r) => r.rank as number);
  return fallback.slice(-7);
}

function TrendBars({
  values,
  title,
  valueTitle,
}: {
  values: number[];
  title: string;
  valueTitle: (v: number) => string;
}) {
  if (values.length === 0) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  return (
    <div className="flex h-9 max-w-[120px] items-end gap-0.5" aria-hidden title={title}>
      {values.map((v, i) => {
        const norm = (max - v) / span;
        const h = 6 + norm * 26;
        return (
          <div
            key={`${i}-${v}`}
            title={valueTitle(v)}
            className="w-1.5 shrink-0 rounded-sm bg-emerald-500/75 ring-1 ring-emerald-400/20"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

function RankDelta7d({
  values,
  labels,
}: {
  values: number[];
  labels: { improved: string; worse: string; same: string };
}) {
  if (values.length < 2) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  const prev = values[0];
  const curr = values[values.length - 1];
  if (curr < prev) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{labels.improved}</span>
        <span aria-hidden>{prev - curr}</span>
      </span>
    );
  }
  if (curr > prev) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400/90">
        <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{labels.worse}</span>
        <span aria-hidden>{curr - prev}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      <Minus className="size-3.5" aria-hidden />
      <span>{labels.same}</span>
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
        <button
          type="button"
          className="inline-flex shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          title={detailTooltip}
          aria-label={detailTooltip}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

export type KeywordWatchlistTableProps = {
  rows: KeywordWithRanks[];
  totalFilteredCount: number;
  page: number;
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number];
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: (typeof PAGE_SIZE_OPTIONS)[number]) => void;
  appNameById: ReadonlyMap<string, string>;
  appRowById: ReadonlyMap<string, WorkspaceAppListRow>;
  filterAppId: string | "all";
  showSkeleton: boolean;
  blockingError: boolean;
  mutationPending: boolean;
  serperRowRefreshId: string | null;
  countryLabel: (code: SupportedCountryCode) => string;
  onHistory: (row: KeywordWithRanks) => void;
  onDelete: (id: string) => void;
  onSerperRefresh: (id: string) => void;
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
  appRowById,
  filterAppId,
  showSkeleton,
  blockingError,
  mutationPending,
  serperRowRefreshId,
  countryLabel,
  onHistory,
  onDelete,
  onSerperRefresh,
}: KeywordWatchlistTableProps) {
  const t = useTranslations("keywordTracker");
  const locale = useLocale();
  const rankNotInTopExpl = t("table.rankNotInTopTooltip");

  const rangeStart = totalFilteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalFilteredCount);

  return (
    <div className="flex flex-col">
      <div className="max-h-[min(70vh,720px)] overflow-auto overscroll-contain">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-start text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="sticky top-0 z-10 bg-[#0c1018] px-5 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.keyword")}
              </th>
              <th
                className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]"
                title={t("table.rankTooltip")}
              >
                {t("table.currentRank")}
              </th>
              <th
                className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]"
                title={t("table.rankTooltip")}
              >
                {t("table.bestRank")}
              </th>
              <th
                className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]"
                title={t("table.trendTooltip")}
              >
                {t("table.trend")}
              </th>
              <th className="sticky top-0 z-10 bg-[#0c1018] px-4 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                {t("table.lastSync")}
              </th>
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
                const trendVals = trendWindowRanks(row.ranks);
                const best =
                  typeof row.keywordBestRank === "number" &&
                  Number.isFinite(row.keywordBestRank)
                    ? row.keywordBestRank
                    : bestRankFromRanks(row.ranks);
                const latest = row.latest;
                const rankFmt = { notInTop: t("table.rankNotInTop") };
                const perCountry = row.latestPerCountry;
                const chipCodes =
                  row.trackedCountryCodes && row.trackedCountryCodes.length > 0
                    ? row.trackedCountryCodes
                    : countriesForKeywordRankChips({
                        market: row.market,
                        targetCountries:
                          appRowById.get(row.app_id)?.target_countries ?? null,
                      });
                const primary = primaryMarketCode(row.market);
                const rankAuthenticityTitle =
                  primary === "cn"
                    ? t("table.rankAuthenticityTooltipChina")
                    : primary != null
                      ? t("table.rankAuthenticityTooltip", {
                          country: countryLabel(primary),
                        })
                      : t("table.rankTooltip");
                const syncAt = row.lastSyncedAt ?? latest?.captured_at ?? null;
                const pendingInitialSync = isPendingInitialRankSync(row);
                const rankDetailHint = t("table.rankNotInTopDetailTooltip", {
                  appName: appNameById.get(row.app_id) ?? row.app_id,
                });

                return (
                  <tr
                    key={row.id}
                    className="border-b border-white/[0.06] transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-start text-[15px] font-semibold text-emerald-300/95 underline-offset-4 hover:text-emerald-200 hover:underline"
                          onClick={() => onHistory(row)}
                        >
                          {row.term}
                        </button>
                        {row.recentRankGainBadge != null ? (
                          <span
                            className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500/20 px-2 text-[11px] font-bold tabular-nums text-emerald-300 ring-1 ring-emerald-500/35"
                            title={t("table.rankGainBadgeTooltip", {
                              positions: row.recentRankGainBadge,
                            })}
                          >
                            +{row.recentRankGainBadge}
                          </span>
                        ) : null}
                      </div>
                      {filterAppId === "all" ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          {appNameById.get(row.app_id) ?? row.app_id}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top font-mono text-zinc-100">
                      {pendingInitialSync ? (
                        <RankSyncingPlaceholder label={t("table.rankSyncing")} />
                      ) : perCountry && perCountry.length > 0 ? (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                          {perCountry.map((e) => (
                            <span
                              key={e.country}
                              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[13px] leading-none tabular-nums shadow-sm"
                              title={
                                e.rank >= SERPER_RANK_NOT_IN_FIRST_PAGE
                                  ? rankNotInTopExpl
                                  : `${countryLabel(e.country)} · ${rankAuthenticityTitle}`
                              }
                            >
                              <span className="text-base leading-none" aria-hidden>
                                {COUNTRY_FLAG_EMOJI[e.country]}
                              </span>
                              <NotInTopRankWithHint
                                rank={e.rank}
                                rankFmt={rankFmt}
                                detailTooltip={rankDetailHint}
                              />
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span
                          className="inline-flex max-w-full flex-wrap items-center gap-2"
                          title={
                            latest?.rank != null &&
                            latest.rank >= SERPER_RANK_NOT_IN_FIRST_PAGE
                              ? rankNotInTopExpl
                              : rankAuthenticityTitle
                          }
                        >
                          {chipCodes.length > 0 ? (
                            <span
                              className="inline-flex shrink-0 items-center gap-1"
                              aria-hidden
                            >
                              {chipCodes.map((c) => (
                                <span
                                  key={c}
                                  className="inline-flex items-center rounded-md border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 text-[13px] leading-none tabular-nums shadow-sm"
                                  title={countryLabel(c)}
                                >
                                  {COUNTRY_FLAG_EMOJI[c]}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          <NotInTopRankWithHint
                            rank={latest?.rank ?? null}
                            rankFmt={rankFmt}
                            detailTooltip={rankDetailHint}
                          />
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-4 align-top font-mono text-zinc-300"
                      title={
                        best != null && best >= SERPER_RANK_NOT_IN_FIRST_PAGE
                          ? rankNotInTopExpl
                          : t("table.rankTooltip")
                      }
                    >
                      {best != null ? (
                        <NotInTopRankWithHint
                          rank={best}
                          rankFmt={rankFmt}
                          detailTooltip={rankDetailHint}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap items-center gap-3">
                        <TrendBars
                          values={trendVals}
                          title={t("table.trendTooltip")}
                          valueTitle={(v) =>
                            v >= SERPER_RANK_NOT_IN_FIRST_PAGE
                              ? rankFmt.notInTop
                              : `#${v}`
                          }
                        />
                        <RankDelta7d
                          values={trendVals}
                          labels={{
                            improved: t("delta.improved"),
                            worse: t("delta.worse"),
                            same: t("delta.same"),
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-start align-top text-zinc-300">
                      {syncAt ? (
                        <span className="text-sm tabular-nums text-zinc-200">
                          {formatRelativePastSince(syncAt, locale, {
                            justNow: t("table.justNow"),
                          })}
                        </span>
                      ) : pendingInitialSync ? (
                        <span className="text-sm text-zinc-500">
                          {t("table.pendingInitialFetch")}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "gap-1.5 text-emerald-300/90 hover:bg-emerald-500/10 hover:text-emerald-200",
                            serperRowRefreshId === row.id && "pointer-events-none",
                          )}
                          title={t("actions.refreshSerperHint", {
                            per: AI_CREDIT_COSTS.serper_preview_per_country,
                          })}
                          disabled={
                            blockingError ||
                            mutationPending ||
                            (serperRowRefreshId != null &&
                              serperRowRefreshId !== row.id)
                          }
                          aria-busy={serperRowRefreshId === row.id}
                          onClick={() => onSerperRefresh(row.id)}
                        >
                          {serperRowRefreshId === row.id ? (
                            <Loader2
                              className="size-4 shrink-0 animate-spin text-emerald-200"
                              aria-hidden
                            />
                          ) : (
                            <RefreshCw className="size-3.5 shrink-0" aria-hidden />
                          )}
                          {serperRowRefreshId === row.id
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
                          onClick={() => onHistory(row)}
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
                          onClick={() => onDelete(row.id)}
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
  );
}
