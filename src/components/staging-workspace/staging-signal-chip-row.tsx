"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { resolveOriginModuleLabel } from "@/lib/client/market-intel-signals";
import type {
  CompetitorKeywordSignal,
  MarketOpportunitySignal,
  StagingSignal,
} from "@/lib/client/staging-workspace-types";
import {
  ActionableChipRow,
  difficultyToTone,
  type ChipMetadataTag,
} from "@/components/staging-workspace/actionable-chip-row";

function competitorCategoryTag(
  category: CompetitorKeywordSignal["category"],
  locale: "en" | "ar",
): ChipMetadataTag {
  const labels = {
    high_volume: locale === "ar" ? "عالي الحجم" : "HIGH-VOLUME",
    intent_based: locale === "ar" ? "موجه بالنية" : "INTENT",
    competitor_gap: locale === "ar" ? "فجوة تنافسية" : "GAP",
  };
  const tones = {
    high_volume: "sky" as const,
    intent_based: "violet" as const,
    competitor_gap: "orange" as const,
  };
  return {
    label: labels[category],
    tone: tones[category] ?? "sky",
  };
}

function marketTrendTag(
  signal: MarketOpportunitySignal,
  locale: "en" | "ar",
): ChipMetadataTag | null {
  if (signal.searchVolume) {
    return {
      label: signal.searchVolume.toLocaleString(),
      tone: "emerald",
    };
  }
  if (signal.trend) {
    const trendLabels: Record<string, string> =
      locale === "ar"
        ? { rising: "صاعد", stable: "مستقر", declining: "هابط" }
        : { rising: "RISING", stable: "STABLE", declining: "DECLINING" };
    return {
      label: trendLabels[signal.trend] ?? signal.trend.toUpperCase(),
      tone: "emerald",
    };
  }
  return null;
}

export type StagingSignalChipRowProps = {
  signal: StagingSignal;
  locale: "en" | "ar";
  isRtl: boolean;
  isStaged?: boolean;
  isRemoving?: boolean;
  onRemove: (signalId: string, source: string) => void;
  removeLabel?: string;
};

export function StagingSignalChipRow({
  signal,
  locale,
  isRtl,
  isStaged = true,
  isRemoving = false,
  onRemove,
  removeLabel,
}: StagingSignalChipRowProps) {
  const t = useTranslations("optimizer.activeContext");

  const { summary, tags, sourceTooltip } = useMemo(() => {
    if (signal.source === "market_spotlight") {
      const market = signal as MarketOpportunitySignal;
      const sourceName = resolveOriginModuleLabel(
        market.metadata as Record<string, unknown> | undefined,
        locale,
      );
      const trend = marketTrendTag(market, locale);
      return {
        summary: market.keyword,
        tags: trend ? [trend] : [],
        sourceTooltip: t("chipSource", { source: sourceName }),
      };
    }

    if (signal.source === "competitor_keyword") {
      const keyword = signal as CompetitorKeywordSignal;
      return {
        summary: keyword.keyword,
        tags: [competitorCategoryTag(keyword.category, locale)],
        sourceTooltip: t("chipSource", { source: t("chipSourceCompetitorSpy") }),
      };
    }

    return {
      summary: signal.source === "review_issue" ? signal.content : "—",
      tags: [] as ChipMetadataTag[],
      sourceTooltip: t("chipSource", { source: t("chipSourceReviews") }),
    };
  }, [signal, locale, t]);

  return (
    <ActionableChipRow
      summary={summary}
      tags={tags}
      sourceTooltip={sourceTooltip}
      isRtl={isRtl}
      isStaged={isStaged}
      isRemoving={isRemoving}
      removeLabel={removeLabel ?? t("removeSignal")}
      onRemove={() => onRemove(signal.id, signal.source)}
    />
  );
}

export function keywordSignalToChipRowProps(
  signal: { keyword: string; difficulty: number },
  difficultyLabel: string,
  sourceTooltip: string,
): { summary: string; tags: ChipMetadataTag[]; sourceTooltip: string } {
  return {
    summary: signal.keyword,
    tags: [{ label: difficultyLabel, tone: difficultyToTone(signal.difficulty) }],
    sourceTooltip,
  };
}
