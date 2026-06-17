"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReviewAnalysisStatus } from "@/lib/review-insights/credit-gate";
import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import {
  ActiveContextSlot,
  ActiveContextSlotEmpty,
} from "@/components/staging-workspace/active-context-slot";
import { ACTIVE_CONTEXT_MODULE_ICON_COLOR } from "@/components/staging-workspace/active-context-tokens";
import { ActiveContextSignalList } from "@/components/staging-workspace/active-context-signal-list";
import {
  ActionableChipRow,
  reviewCategoryToTone,
  severityToTone,
  type ChipMetadataTag,
} from "@/components/staging-workspace/actionable-chip-row";
import { ACTIVE_CONTEXT_ROW_MIN_HEIGHT } from "@/components/staging-workspace/active-context-tokens";

const REVIEW_CHIP_ROW_H = ACTIVE_CONTEXT_ROW_MIN_HEIGHT;

const SYNC_ATTENTION_STATUSES = new Set<ReviewAnalysisStatus>([
  "EXPIRED",
  "REFUNDED",
  "INVALID_TRANSACTION",
]);

export type ReviewInsightsPanelProps = {
  pendingInsights: PendingReviewInsight[];
  adoptedInsights: PendingReviewInsight[];
  workspaceId: string;
  isRtl?: boolean;
  analysisStatus: ReviewAnalysisStatus;
  gateValid: boolean;
  adoptingId?: string | null;
  removingId?: string | null;
  onDismiss: (insightId: string) => void;
  onAdopt: (insight: PendingReviewInsight) => void;
  onUnstage: (insight: PendingReviewInsight) => void;
};

export function ReviewInsightsPanel({
  pendingInsights,
  adoptedInsights,
  workspaceId,
  isRtl = false,
  analysisStatus,
  gateValid,
  adoptingId = null,
  removingId = null,
  onDismiss,
  onAdopt,
  onUnstage,
}: ReviewInsightsPanelProps) {
  const t = useTranslations("optimizer.reviewInsights");
  const tGrowth = useTranslations("reviews.growthMode");
  const tSlot = useTranslations("optimizer.activeContext");
  const [justStagedId, setJustStagedId] = useState<string | null>(null);
  const adoptEnabled = gateValid && analysisStatus === "SUCCESS_PAID";
  const cards = [...pendingInsights, ...adoptedInsights];
  const signalCount = cards.length;
  const syncAttention = SYNC_ATTENTION_STATUSES.has(analysisStatus);
  const showSyncCta = analysisStatus !== "SUCCESS_PAID";
  const uppercaseSeverity = !isRtl;
  const sourceTooltip = tSlot("chipSource", { source: tSlot("chipSourceReviews") });

  const handleAdopt = useCallback(
    (insight: PendingReviewInsight) => {
      setJustStagedId(insight.id);
      onAdopt(insight);
    },
    [onAdopt],
  );

  useEffect(() => {
    if (!justStagedId) return;
    const adoptedNow = adoptedInsights.some((i) => i.id === justStagedId);
    if (adoptedNow) {
      const timer = window.setTimeout(() => setJustStagedId(null), 800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [adoptedInsights, justStagedId]);

  return (
    <ActiveContextSlot
      id="active-context-review-insights"
      icon={AlertTriangle}
      iconColor={ACTIVE_CONTEXT_MODULE_ICON_COLOR.reviewInsights}
      title={tSlot("reviewInsightsSlotTitle")}
      description={tSlot("reviewInsightsSlotDescription")}
      moduleTip={tSlot("reviewInsightsModuleTip")}
      count={signalCount}
      isRtl={isRtl}
      headerStatusWarning={
        syncAttention ? tSlot("syncExpiredHeaderWarning") : undefined
      }
    >
      {cards.length === 0 ? (
        <ActiveContextSlotEmpty
          message={
            showSyncCta ? tSlot("syncRequiredInline") : tSlot("noActiveSignals")
          }
          ctaLabel={showSyncCta ? tSlot("reviewInsightsSyncCta") : undefined}
          ctaHref={showSyncCta ? `/app/${workspaceId}/reviews` : undefined}
          isRtl={isRtl}
        />
      ) : (
        <ActiveContextSignalList rowHeight={REVIEW_CHIP_ROW_H}>
          {cards.map((insight) => {
            const adopted = insight.status === "adopted";
            const busy = adoptingId === insight.id || removingId === insight.id;
            const severityLabel = uppercaseSeverity
              ? insight.severity.toUpperCase()
              : insight.severity;

            const tags: ChipMetadataTag[] = [
              {
                label: t(`categories.${insight.category}`),
                tone: reviewCategoryToTone(insight.category),
              },
              {
                label: severityLabel,
                tone: severityToTone(insight.severity),
              },
            ];

            if (insight.growthStrategyTag === "product_improvement") {
              tags.push({
                label: tGrowth("tagProductImprovement"),
                tone: "sky",
              });
            } else if (insight.growthStrategyTag === "oppositional_target") {
              tags.push({
                label: tGrowth("tagOppositionalTarget"),
                tone: "orange",
              });
            }

            if (insight.impactPercent != null && insight.impactPercent > 0) {
              tags.push({
                label: tGrowth("impactLabel", { pct: insight.impactPercent }),
                tone: "amber",
              });
            }

            return (
              <ActionableChipRow
                key={insight.id}
                summary={insight.title}
                tags={tags}
                sourceTooltip={sourceTooltip}
                isRtl={isRtl}
                lineClamp={2}
                minHeight={REVIEW_CHIP_ROW_H}
                isStaged={adopted}
                justStaged={justStagedId === insight.id}
                isRemoving={busy}
                isStaging={adoptingId === insight.id}
                showRemove
                removeLabel={adopted ? tSlot("removeSignal") : t("dismiss")}
                onRemove={
                  adopted
                    ? () => onUnstage(insight)
                    : () => onDismiss(insight.id)
                }
                showStageButton={!adopted && adoptEnabled}
                stageLabel={t("adopt")}
                onStageClick={
                  adopted || !adoptEnabled
                    ? undefined
                    : () => handleAdopt(insight)
                }
              />
            );
          })}
        </ActiveContextSignalList>
      )}
    </ActiveContextSlot>
  );
}
