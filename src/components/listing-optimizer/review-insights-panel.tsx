"use client";

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
} from "@/components/staging-workspace/actionable-chip-row";

const SYNC_ATTENTION_STATUSES = new Set<ReviewAnalysisStatus>([
  "EXPIRED",
  "REFUNDED",
  "INVALID_TRANSACTION",
]);

const REVIEW_CHIP_ROW_H = 34;

export type ReviewInsightsPanelProps = {
  pendingInsights: PendingReviewInsight[];
  adoptedInsights: PendingReviewInsight[];
  workspaceId: string;
  isRtl?: boolean;
  analysisStatus: ReviewAnalysisStatus;
  gateValid: boolean;
  adoptingId?: string | null;
  onDismiss: (insightId: string) => void;
  onAdopt: (insight: PendingReviewInsight) => void;
};

export function ReviewInsightsPanel({
  pendingInsights,
  adoptedInsights,
  workspaceId,
  isRtl = false,
  analysisStatus,
  gateValid,
  adoptingId = null,
  onDismiss,
  onAdopt,
}: ReviewInsightsPanelProps) {
  const t = useTranslations("optimizer.reviewInsights");
  const tSlot = useTranslations("optimizer.activeContext");
  const adoptEnabled = gateValid && analysisStatus === "SUCCESS_PAID";
  const cards = [...pendingInsights, ...adoptedInsights];
  const signalCount = cards.length;
  const syncAttention = SYNC_ATTENTION_STATUSES.has(analysisStatus);
  const showSyncCta = analysisStatus !== "SUCCESS_PAID";
  const uppercaseSeverity = !isRtl;
  const sourceTooltip = tSlot("chipSource", { source: tSlot("chipSourceReviews") });

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
            const busy = adoptingId === insight.id;
            const severityLabel = uppercaseSeverity
              ? insight.severity.toUpperCase()
              : insight.severity;

            return (
              <ActionableChipRow
                key={insight.id}
                summary={insight.title}
                tags={[
                  {
                    label: t(`categories.${insight.category}`),
                    tone: reviewCategoryToTone(insight.category),
                  },
                  {
                    label: severityLabel,
                    tone: severityToTone(insight.severity),
                  },
                ]}
                sourceTooltip={sourceTooltip}
                isRtl={isRtl}
                lineClamp={2}
                minHeight={REVIEW_CHIP_ROW_H}
                isRemoving={busy}
                showRemove={!adopted}
                removeLabel={t("dismiss")}
                onRemove={adopted ? undefined : () => onDismiss(insight.id)}
                onRowClick={
                  adopted || !adoptEnabled
                    ? undefined
                    : () => onAdopt(insight)
                }
              />
            );
          })}
        </ActiveContextSignalList>
      )}
    </ActiveContextSlot>
  );
}
