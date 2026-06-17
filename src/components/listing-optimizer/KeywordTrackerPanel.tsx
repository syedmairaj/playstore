"use client";

import { useCallback, useMemo, useState } from "react";
import { Hash } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ActiveContextSlot,
  ActiveContextSlotEmpty,
} from "@/components/staging-workspace/active-context-slot";
import { ActiveContextSignalList } from "@/components/staging-workspace/active-context-signal-list";
import { ActionableChipRow } from "@/components/staging-workspace/actionable-chip-row";
import { ACTIVE_CONTEXT_MODULE_ICON_COLOR } from "@/components/staging-workspace/active-context-tokens";
import { keywordSignalToChipRowProps } from "@/components/staging-workspace/staging-signal-chip-row";
import { difficultyBadge, type KeywordSignal } from "@/lib/staging/keyword-signals";
import {
  KEYWORD_SIGNALS_KEY,
  useKeywordSignals,
  patchKeywordSignalsCache,
  type VaultLocale,
} from "@/hooks/useOptimizerSync";

import { ACTIVE_CONTEXT_ROW_MIN_HEIGHT } from "@/components/staging-workspace/active-context-tokens";

export interface KeywordTrackerPanelProps {
  workspaceId: string;
  appId: string;
  vaultLocale: VaultLocale;
  isRtl?: boolean;
  onOpenValidator: (keyword: string, signal?: KeywordSignal) => void;
  isLoading?: boolean;
  trackerSignals?: KeywordSignal[];
}

export default function KeywordTrackerPanel({
  workspaceId,
  appId,
  vaultLocale,
  isRtl: isRtlProp,
  onOpenValidator,
  trackerSignals,
}: KeywordTrackerPanelProps) {
  const isRtl = isRtlProp ?? vaultLocale === "ar";
  const t = useTranslations("optimizer.activeContext");
  const queryClient = useQueryClient();
  const { signals: vaultSignals } = useKeywordSignals(
    workspaceId,
    appId,
    vaultLocale,
  );
  const [removingKeyword, setRemovingKeyword] = useState<string | null>(null);

  const signals = trackerSignals !== undefined ? trackerSignals : vaultSignals;
  const total = signals.length;
  const sourceTooltip = t("chipSource", { source: t("chipSourceKeywordTracker") });

  const sortedSignals = useMemo(
    () => [...signals].sort((a, b) => b.confidence - a.confidence),
    [signals],
  );

  const difficultyText = useCallback(
    (value: number) => {
      const d = difficultyBadge(value);
      const key =
        d.label === "Easy"
          ? "difficultyEasy"
          : d.label === "Medium"
            ? "difficultyMedium"
            : "difficultyHard";
      const label = t(key);
      return vaultLocale === "en" ? label.toUpperCase() : label;
    },
    [t, vaultLocale],
  );

  const removeMutation = useMutation({
    mutationFn: async (keyword: string) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/staging-vault/keywords`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, locale: vaultLocale, keyword }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? t("keywordTrackerRemoveFailed"));
      }
      return keyword;
    },
    onMutate: async (keyword) => {
      setRemovingKeyword(keyword);
      patchKeywordSignalsCache(
        queryClient,
        workspaceId,
        appId,
        (prev) => prev.filter((s) => s.keyword !== keyword),
        vaultLocale,
      );
    },
    onSuccess: (keyword) => {
      toast.success(t("keywordTrackerRemoved", { keyword }));
    },
    onError: (err: Error) => {
      toast.error(err.message ?? t("keywordTrackerRemoveFailed"));
      void queryClient.invalidateQueries({
        queryKey: KEYWORD_SIGNALS_KEY(workspaceId, appId, vaultLocale),
      });
    },
    onSettled: () => {
      setRemovingKeyword(null);
    },
  });

  const hasSignals = total > 0;

  return (
    <div dir={isRtl ? "rtl" : "ltr"} lang={vaultLocale}>
      <ActiveContextSlot
        id="active-context-keyword-tracker"
        icon={Hash}
        iconColor={ACTIVE_CONTEXT_MODULE_ICON_COLOR.keywordTracker}
        title={t("keywordTracker")}
        description={t("keywordTrackerHelp")}
        moduleTip={t("keywordTrackerModuleTip")}
        count={total}
        isRtl={isRtl}
      >
        {!hasSignals ? (
          <ActiveContextSlotEmpty
            message={t("noActiveSignals")}
            ctaLabel={t("openValidatorCta")}
            onCtaClick={() => onOpenValidator("")}
            isRtl={isRtl}
          />
        ) : (
          <ActiveContextSignalList rowHeight={ACTIVE_CONTEXT_ROW_MIN_HEIGHT}>
            {sortedSignals.map((signal) => {
              const chip = keywordSignalToChipRowProps(
                signal,
                difficultyText(signal.difficulty),
                sourceTooltip,
              );
              return (
                <ActionableChipRow
                  key={signal.keyword}
                  summary={chip.summary}
                  tags={chip.tags}
                  sourceTooltip={chip.sourceTooltip}
                  isRtl={isRtl}
                  isStaged
                  minHeight={ACTIVE_CONTEXT_ROW_MIN_HEIGHT}
                  isRemoving={removingKeyword === signal.keyword}
                  removeLabel={t("removeKeyword", { keyword: signal.keyword })}
                  onRowClick={() => onOpenValidator(signal.keyword, signal)}
                  onRemove={() => removeMutation.mutate(signal.keyword)}
                />
              );
            })}
          </ActiveContextSignalList>
        )}
      </ActiveContextSlot>
    </div>
  );
}

export function KeywordTrackerEmptySlot({ isRtl = false }: { isRtl?: boolean }) {
  const t = useTranslations("optimizer.activeContext");

  return (
    <ActiveContextSlot
      id="active-context-keyword-tracker"
      icon={Hash}
      iconColor={ACTIVE_CONTEXT_MODULE_ICON_COLOR.keywordTracker}
      title={t("keywordTracker")}
      description={t("keywordTrackerHelp")}
      moduleTip={t("keywordTrackerModuleTip")}
      count={0}
      isRtl={isRtl}
    >
      <ActiveContextSlotEmpty message={t("noActiveSignals")} isRtl={isRtl} />
    </ActiveContextSlot>
  );
}
