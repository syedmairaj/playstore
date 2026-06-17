"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MarketIntelligenceReport } from "@/lib/market/market-intel-signal-types";
import { useOptimizationQueue } from "@/hooks/useOptimizationQueue";
import { validateAndQueue } from "@/lib/client/validate-and-queue";
import {
  collectStagedMarketIntelKeys,
  competitorThreatStageKey,
  growthKeywordStageKey,
  marketSpotlightToQueueInputs,
  marketThreatsToQueueInputs,
  type MarketSpotlightContext,
} from "@/lib/client/market-spotlight-staging";
import { KeywordSpotlightCard } from "@/components/market/keyword-spotlight-card";
import { useActiveContextVaultEvents } from "@/hooks/useActiveContextVaultEvents";

type Props = {
  report: MarketIntelligenceReport;
  workspaceId: string;
  appId?: string;
  context: MarketSpotlightContext;
  isRtl: boolean;
};

export function SpotlightKeywordCuration({
  report,
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

  const stagedKeys = useMemo(
    () => collectStagedMarketIntelKeys(queueItems),
    [queueItems],
  );

  const [selectedGrowth, setSelectedGrowth] = useState<Set<string>>(() => new Set());
  const [selectedThreats, setSelectedThreats] = useState<Set<string>>(() => new Set());
  const [staging, setStaging] = useState(false);

  const toggleGrowth = useCallback(
    (key: string) => {
      if (stagedKeys.has(key)) return;
      setSelectedGrowth((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [stagedKeys],
  );

  const toggleThreat = useCallback(
    (key: string) => {
      if (stagedKeys.has(key)) return;
      setSelectedThreats((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [stagedKeys],
  );

  const selectedGrowthSignals = useMemo(
    () =>
      report.growthKeywords.filter((signal) =>
        selectedGrowth.has(growthKeywordStageKey(signal)),
      ),
    [report.growthKeywords, selectedGrowth],
  );

  const selectedThreatSignals = useMemo(
    () =>
      report.competitorThreats.filter((signal) =>
        selectedThreats.has(competitorThreatStageKey(signal)),
      ),
    [report.competitorThreats, selectedThreats],
  );

  const selectedCount = selectedGrowthSignals.length + selectedThreatSignals.length;

  const handleStageSelected = useCallback(async () => {
    if (selectedCount === 0 || staging) return;

    setStaging(true);
    try {
      const keywordInputs = marketSpotlightToQueueInputs(
        selectedGrowthSignals.map((s) => s.term),
        context,
        vaultLocale,
      );
      const threatInputs = marketThreatsToQueueInputs(
        selectedThreatSignals,
        context,
        vaultLocale,
      );
      const inputs = [...keywordInputs, ...threatInputs];

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
        setSelectedGrowth(new Set());
        setSelectedThreats(new Set());
        return;
      }

      toast.success(t("stageSuccess", { count: result.addedCount }));
      setSelectedGrowth(new Set());
      setSelectedThreats(new Set());
    } catch {
      toast.error(t("stageError"));
    } finally {
      setStaging(false);
    }
  }, [
    addItems,
    appId,
    context,
    locale,
    queueItems,
    selectedCount,
    selectedGrowthSignals,
    selectedThreatSignals,
    staging,
    t,
    vaultLocale,
    workspaceId,
  ]);

  const selectableCount =
    report.growthKeywords.filter((s) => !stagedKeys.has(growthKeywordStageKey(s))).length +
    report.competitorThreats.filter((s) => !stagedKeys.has(competitorThreatStageKey(s))).length;

  return (
    <div className="space-y-3">
      <KeywordSpotlightCard
        report={report}
        isRtl={isRtl}
        curation={{
          selectedGrowth,
          selectedThreats,
          staged: stagedKeys,
          onToggleGrowth: toggleGrowth,
          onToggleThreat: toggleThreat,
          growthKey: growthKeywordStageKey,
          threatKey: competitorThreatStageKey,
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
          disabled={staging || selectedCount === 0}
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
              {selectedCount > 0
                ? t("stageSelected", { count: selectedCount })
                : t("stageSelectedEmpty")}
              <ChevronRight
                className={cn("size-4 shrink-0 opacity-70", isRtl && "rotate-180")}
                aria-hidden
              />
            </>
          )}
        </button>

        {selectableCount === 0 && stagedKeys.size > 0 && (
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
