import type { SupportedCountryCode } from "@/lib/countries";
import { formatRankForDisplay } from "@/lib/keywords/format-rank-display";
import type { KeywordWithRanks } from "@/lib/keywords/load-workspace-keywords";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatCurrentRanksForCsv(
  row: KeywordWithRanks,
  rankFmt: { notInTop: string },
  countryLabels: Record<SupportedCountryCode, string>,
): string {
  if (row.latestPerCountry && row.latestPerCountry.length > 0) {
    return row.latestPerCountry
      .map(
        (e) =>
          `${countryLabels[e.country] ?? e.country}: ${formatRankForDisplay(e.rank, rankFmt)}`,
      )
      .join("; ");
  }
  const rank = formatRankForDisplay(row.latest?.rank ?? null, rankFmt);
  return rank;
}

export function buildKeywordWatchlistCsv(params: {
  rows: KeywordWithRanks[];
  appNameById: ReadonlyMap<string, string>;
  rankFmt: { notInTop: string };
  countryLabels: Record<SupportedCountryCode, string>;
  headers: {
    keyword: string;
    app: string;
    currentRank: string;
    bestRank: string;
    lastSync: string;
  };
  formatSyncAt: (iso: string | null | undefined) => string;
}): string {
  const lines = [
    [
      params.headers.keyword,
      params.headers.app,
      params.headers.currentRank,
      params.headers.bestRank,
      params.headers.lastSync,
    ].join(","),
  ];

  for (const row of params.rows) {
    const best =
      typeof row.keywordBestRank === "number" && Number.isFinite(row.keywordBestRank)
        ? row.keywordBestRank
        : row.ranks
            .map((r) => r.rank)
            .filter(
              (n): n is number =>
                n != null && n <= SERPER_RANK_NOT_IN_FIRST_PAGE,
            )
            .sort((a, b) => a - b)[0] ?? null;

    const syncAt = row.lastSyncedAt ?? row.latest?.captured_at ?? null;

    lines.push(
      [
        csvEscape(row.term),
        csvEscape(params.appNameById.get(row.app_id) ?? row.app_id),
        csvEscape(formatCurrentRanksForCsv(row, params.rankFmt, params.countryLabels)),
        csvEscape(formatRankForDisplay(best, params.rankFmt)),
        csvEscape(params.formatSyncAt(syncAt)),
      ].join(","),
    );
  }

  return `\uFEFF${lines.join("\n")}`;
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
