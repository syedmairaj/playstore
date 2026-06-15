"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { KeywordSpotlightResult } from "@/app/api/market/keyword-spotlight/route";
import { useOptimizationQueue } from "@/hooks/useOptimizationQueue";
import { validateAndQueue } from "@/lib/client/validate-and-queue";
import {
  collectStagedSpotlightKeywords,
  marketSpotlightToQueueInputs,
  type MarketSpotlightContext,
} from "@/lib/client/market-spotlight-staging";
import { KeywordSpotlightCard } from "@/components/market/keyword-spotlight-card";
import { useActiveContextVaultEvents } from "@/hooks/useActiveContextVaultEvents";

type Props = {
  spotlight: KeywordSpotlightResult;
  workspaceId: string;
  appId?: string;
  context: MarketSpotlightContext;
  isRtl: boolean;
};

export function SpotlightKeywordCuration({
  spotlight,
  workspaceId,
  appId,
  context,
  isRtl,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("market.spotlight");
  const vaultLocale = locale === "ar" ? "ar" : "en";

  useActiveContextVaultEvents({ workspaceId, locale: vaultLocale });

  const { items: queueItems, addItems } = useOptimizationQueue(workspaceId, vaultLocale, appId);

  const stagedKeywords = useMemo(
    () => collectStagedSpotlightKeywords(queueItems),
    [queueItems],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [staging, setStaging] = useState(false);

  const toggleKeyword = useCallback(
    (keyword: string) => {
      if (stagedKeywords.has(keyword)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(keyword)) next.delete(keyword);
        else next.add(keyword);
        return next;
      });
    },
    [stagedKeywords],
  );

  const selectedList = useMemo(
    () => spotlight.trendingKeywords.filter((kw) => selected.has(kw)),
    [spotlight.trendingKeywords, selected],
  );

  const handleStageSelected = useCallback(async () => {
    if (selectedList.length === 0 || staging) return;

    setStaging(true);
    try {
      const inputs = marketSpotlightToQueueInputs(selectedList, context, vaultLocale);
      const result = await validateAndQueue({
        source: "market_intel_spotlight",
        workspaceId,
        workspaceLocale: locale,
        appId,
        items: inputs,
        existingQueue: queueItems,
        addItems: async (batch) => {
          const response = await addItems(batch);
          return {
            addedCount: response.addedCount ?? 0,
            skippedCount: response.skippedCount,
          };
        },
      });

      if (!result.ok) {
        toast.error(result.error ?? t("stageError"));
        return;
      }

      if (result.alreadyQueued) {
        toast.info(t("stageAlreadyAll"));
        setSelected(new Set());
        return;
      }

      toast.success(t("stageSuccess", { count: result.addedCount }));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const kw of selectedList) next.delete(kw);
        return next;
      });
    } catch {
      toast.error(t("stageError"));
    } finally {
      setStaging(false);
    }
  }, [
    addItems,
    context,
    locale,
    queueItems,
    selectedList,
    staging,
    t,
    appId,
    vaultLocale,
    workspaceId,
  ]);

  const selectableCount = spotlight.trendingKeywords.filter(
    (kw) => !stagedKeywords.has(kw),
  ).length;

  return (
    <div className="space-y-3">
      <KeywordSpotlightCard
        spotlight={spotlight}
        isRtl={isRtl}
        curation={{
          selected,
          staged: stagedKeywords,
          onToggle: toggleKeyword,
        }}
      />

      <div className="space-y-2">
        <p
          className={cn(
            "text-[11px] text-zinc-500",
            isRtl && "text-end font-arabic",
          )}
        >
          {t("curationHint")}
        </p>

        <button
          type="button"
          onClick={() => void handleStageSelected()}
          disabled={staging || selectedList.length === 0}
          className={cn(
            "group flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-150",
            "border-sky-500/35 bg-sky-500/10 text-sky-200",
            "hover:border-sky-500/55 hover:bg-sky-500/18 hover:text-sky-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50",
            "disabled:cursor-not-allowed disabled:opacity-45",
            isRtl && "flex-row-reverse font-arabic",
          )}
        >
          {staging ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("staging")}
            </>
          ) : (
            <>
              <Check className="size-4 shrink-0" aria-hidden />
              {selectedList.length > 0
                ? t("stageSelected", { count: selectedList.length })
                : t("stageSelectedEmpty")}
              <ChevronRight
                className={cn("size-4 shrink-0 opacity-70", isRtl && "rotate-180")}
                aria-hidden
              />
            </>
          )}
        </button>

        {selectableCount === 0 && stagedKeywords.size > 0 && (
          <p
            className={cn(
              "text-center text-[11px] text-emerald-400/80",
              isRtl && "font-arabic",
            )}
          >
            {t("allStaged")}
          </p>
        )}
      </div>
    </div>
  );
}
