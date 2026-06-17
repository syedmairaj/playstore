/**
 * Market Intelligence and Competitor Strengths — borderless Active Context slots.
 */

import React, { useState } from "react";
import { AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { marketIntelSignalsSectionId } from "@/lib/client/market-intel-signals";
import {
  ActiveContextSlot,
  ActiveContextSlotEmpty,
} from "@/components/staging-workspace/active-context-slot";
import { ActiveContextSignalList } from "@/components/staging-workspace/active-context-signal-list";
import { StagingSignalChipRow } from "@/components/staging-workspace/staging-signal-chip-row";
import { ACTIVE_CONTEXT_MODULE_ICON_COLOR } from "@/components/staging-workspace/active-context-tokens";
import type {
  StagingPillar,
  RemovalHandler,
  ChipDisplayOptions,
} from "@/lib/client/staging-workspace-types";

import { ACTIVE_CONTEXT_ROW_MIN_HEIGHT } from "@/components/staging-workspace/active-context-tokens";

const pillarIcons = {
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
} as const;

interface StagingWorkspacePillarProps {
  pillar: StagingPillar;
  locale: "en" | "ar";
  isRtl: boolean;
  isLoading?: boolean;
  onRemoveSignal: RemovalHandler;
  chipDisplayOptions?: ChipDisplayOptions;
  workspaceId?: string;
  localeOverride?: "en" | "ar";
}

function pillarSlotKeys(pillarId: StagingPillar["id"]) {
  switch (pillarId) {
    case "market_opportunities":
      return {
        title: "marketIntelSlotTitle" as const,
        description: "marketIntelSlotDescription" as const,
        moduleTip: "marketIntelModuleTip" as const,
        iconColor: ACTIVE_CONTEXT_MODULE_ICON_COLOR.marketIntel,
      };
    case "competitor_keywords":
      return {
        title: "competitorSlotTitle" as const,
        description: "competitorSlotDescription" as const,
        moduleTip: "competitorModuleTip" as const,
        iconColor: ACTIVE_CONTEXT_MODULE_ICON_COLOR.competitor,
      };
    default:
      return {
        title: "reviewInsightsSlotTitle" as const,
        description: "reviewInsightsSlotDescription" as const,
        moduleTip: "reviewInsightsModuleTip" as const,
        iconColor: ACTIVE_CONTEXT_MODULE_ICON_COLOR.reviewInsights,
      };
  }
}

export default function StagingWorkspacePillar({
  pillar,
  locale,
  isRtl,
  isLoading = false,
  onRemoveSignal,
  chipDisplayOptions = {
    showRemoveButton: true,
    showCategory: true,
    showMetadata: true,
    animateOnRemove: true,
  },
  workspaceId,
  localeOverride,
}: StagingWorkspacePillarProps) {
  const tSlot = useTranslations("optimizer.activeContext");
  const resolvedLocale = localeOverride ?? locale;
  const keys = pillarSlotKeys(pillar.id);
  const IconComponent = pillarIcons[pillar.icon as keyof typeof pillarIcons] ?? AlertTriangle;
  const isMarketIntelPillar = pillar.id === "market_opportunities";
  const sectionId = isMarketIntelPillar ? marketIntelSignalsSectionId() : pillar.id;
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove: RemovalHandler = async (signalId, source) => {
    setRemovingId(signalId);
    try {
      await onRemoveSignal(signalId, source);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <ActiveContextSlot
      id={sectionId}
      icon={IconComponent}
      title={tSlot(keys.title)}
      description={tSlot(keys.description)}
      moduleTip={tSlot(keys.moduleTip)}
      count={pillar.count}
      isRtl={isRtl}
      iconColor={keys.iconColor}
    >
      {isLoading ? (
        <div className="flex h-8 w-full items-center gap-1 py-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-1.5 animate-pulse rounded-full bg-white/20"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : pillar.isEmpty ? (
        isMarketIntelPillar && workspaceId ? (
          <ActiveContextSlotEmpty
            message={tSlot("noActiveSignals")}
            ctaLabel={tSlot("openMarketIntelCta")}
            ctaHref={`/app/${workspaceId}/market`}
            isRtl={isRtl}
          />
        ) : (
          <ActiveContextSlotEmpty message={tSlot("noActiveSignals")} isRtl={isRtl} />
        )
      ) : (
        <ActiveContextSignalList rowHeight={ACTIVE_CONTEXT_ROW_MIN_HEIGHT}>
          {pillar.signals.map((signal) => (
            <StagingSignalChipRow
              key={
                signal.source === "review_issue"
                  ? `review-${signal.content.trim().toLowerCase()}`
                  : signal.id
              }
              signal={signal}
              locale={resolvedLocale}
              isRtl={isRtl}
              isStaged
              isRemoving={removingId === signal.id}
              onRemove={
                chipDisplayOptions.showRemoveButton ? handleRemove : () => Promise.resolve()
              }
            />
          ))}
        </ActiveContextSignalList>
      )}
    </ActiveContextSlot>
  );
}
