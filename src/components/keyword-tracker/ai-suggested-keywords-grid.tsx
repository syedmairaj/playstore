"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { AiSuggestedKeywordRow } from "@/components/keyword-tracker/ai-suggested-keyword-row";
import type { DiscoveryKeywordSuggestion } from "@/lib/keywords/discovery-ai-suggestions";
import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const HEADER_CELL =
  "px-4 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500";

function GridSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-white/[0.04] last:border-0">
          <td className="px-4 py-3.5">
            <div className="h-4 w-3/5 max-w-[200px] rounded-md bg-white/[0.06]" />
          </td>
          <td className="px-4 py-3.5">
            <div className="h-5 w-20 rounded-full bg-white/[0.05]" />
          </td>
          <td className="px-4 py-3.5">
            <div className="h-5 w-16 rounded-full bg-white/[0.05]" />
          </td>
          <td className="px-4 py-3.5">
            <div className="ms-auto flex w-fit gap-1.5">
              <div className="h-8 w-32 rounded-lg bg-white/[0.05]" />
              <div className="size-8 rounded-lg bg-white/[0.05]" />
              <div className="size-8 rounded-lg bg-white/[0.05]" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export type AiSuggestedKeywordsGridProps = {
  suggestions: DiscoveryKeywordSuggestion[];
  isRtl?: boolean;
  disabled?: boolean;
  loading?: boolean;
  stagingTerm: string | null;
  trackingTerm: string | null;
  resolveStaged: (kw: string) => ListingAssetTarget | null;
  isTracked: (kw: string) => boolean;
  onStage: (kw: string, asset: ListingAssetTarget) => void;
  onTrack: (kw: string) => void;
  onIgnore: (kw: string) => void;
  onViewSearchVolumeHistory: (kw: string, isTracked: boolean) => void;
};

export function AiSuggestedKeywordsGridEmpty({
  message,
  isRtl = false,
}: {
  message: string;
  isRtl?: boolean;
}) {
  const t = useTranslations("keywordTracker.aiSuggestedKeywords");

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-14 text-center",
        isRtl && "font-arabic",
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
        <Sparkles className="size-5 text-zinc-500" aria-hidden />
      </div>
      <p className="max-w-sm text-sm font-medium text-zinc-400">{message}</p>
      <p className="max-w-md text-xs leading-relaxed text-zinc-600">
        {t("emptyStateHint")}
      </p>
    </div>
  );
}

export function AiSuggestedKeywordsGrid({
  suggestions,
  isRtl = false,
  disabled = false,
  loading = false,
  stagingTerm,
  trackingTerm,
  resolveStaged,
  isTracked,
  onStage,
  onTrack,
  onIgnore,
  onViewSearchVolumeHistory,
}: AiSuggestedKeywordsGridProps) {
  const t = useTranslations("keywordTracker.aiSuggestedKeywords");

  return (
    <TooltipProvider delayDuration={280}>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-white/[0.07] bg-[#060a10]/95 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_20px_48px_-24px_rgba(0,0,0,0.85)]",
          isRtl && "font-arabic",
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[32%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.025]">
                <th
                  scope="col"
                  className={cn(HEADER_CELL, isRtl ? "text-right" : "text-left")}
                >
                  {t("gridKeyword")}
                </th>
                <th
                  scope="col"
                  className={cn(HEADER_CELL, isRtl ? "text-right" : "text-left")}
                >
                  {t("gridType")}
                </th>
                <th
                  scope="col"
                  className={cn(HEADER_CELL, isRtl ? "text-right" : "text-left")}
                >
                  {t("gridStatus")}
                </th>
                <th
                  scope="col"
                  className={cn(HEADER_CELL, isRtl ? "text-left" : "text-right")}
                >
                  {t("gridActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? (
                <GridSkeleton rows={Math.max(suggestions.length, 4)} />
              ) : (
                suggestions.map((suggestion, index) => {
                  const kw = suggestion.keyword;
                  const tracked = isTracked(kw);
                  const stagedAsset = resolveStaged(kw);
                  return (
                    <AiSuggestedKeywordRow
                      key={kw}
                      suggestion={suggestion}
                      rowIndex={index}
                      isTracked={tracked}
                      stagedAsset={stagedAsset}
                      isRtl={isRtl}
                      disabled={disabled}
                      staging={stagingTerm === kw}
                      tracking={trackingTerm === kw.trim()}
                      onStage={(asset) => onStage(kw, asset)}
                      onTrack={() => onTrack(kw)}
                      onIgnore={() => onIgnore(kw)}
                      onViewSearchVolumeHistory={() =>
                        onViewSearchVolumeHistory(kw, tracked)
                      }
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
