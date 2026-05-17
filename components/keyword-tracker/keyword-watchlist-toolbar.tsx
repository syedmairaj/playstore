"use client";

import { Download, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COUNTRY_FLAG_EMOJI,
  type SupportedCountryCode,
} from "@/lib/countries";
import { cn } from "@/lib/utils";
import { WATCHLIST_MARKET_FILTER_CODES } from "@/components/keyword-tracker/keyword-watchlist-filter";

type KeywordWatchlistToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  marketFilter: ReadonlySet<SupportedCountryCode>;
  onToggleMarket: (code: SupportedCountryCode) => void;
  onSelectAllMarkets: () => void;
  onExportCsv: () => void;
  exportDisabled: boolean;
  countryLabel: (code: SupportedCountryCode) => string;
};

export function KeywordWatchlistToolbar({
  search,
  onSearchChange,
  marketFilter,
  onToggleMarket,
  onSelectAllMarkets,
  onExportCsv,
  exportDisabled,
  countryLabel,
}: KeywordWatchlistToolbarProps) {
  const t = useTranslations("keywordTracker.table");

  return (
    <div className="space-y-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 border-white/[0.1] bg-[#070a0f] ps-9 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/40"
            type="search"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exportDisabled}
          onClick={onExportCsv}
          className="h-10 shrink-0 gap-2 border-white/[0.12] bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] hover:text-white"
        >
          <Download className="size-4 shrink-0" aria-hidden />
          {t("exportCsv")}
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("marketFilterLabel")}
      >
        <button
          type="button"
          onClick={onSelectAllMarkets}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            marketFilter.size === 0
              ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200",
          )}
        >
          {t("filterAll")}
        </button>
        {WATCHLIST_MARKET_FILTER_CODES.map((code) => {
          const active = marketFilter.has(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => onToggleMarket(code)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200",
              )}
            >
              <span className="text-sm leading-none" aria-hidden>
                {COUNTRY_FLAG_EMOJI[code]}
              </span>
              <span>{countryLabel(code)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
