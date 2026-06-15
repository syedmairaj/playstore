"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReviewAnalysisStatus } from "@/lib/review-insights/credit-gate";
import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import {
  ActiveContextSlot,
  ActiveContextSlotEmpty,
} from "@/components/staging-workspace/active-context-slot";
import { ActiveContextSignalList } from "@/components/staging-workspace/active-context-signal-list";
import {
  REVIEW_CHIP_ROW_H,
  ReviewInsightChipRow,
} from "@/components/listing-optimizer/review-insight-chip-row";

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

  return (
    <ActiveContextSlot
      id="active-context-review-insights"
      icon={AlertTriangle}
      title={tSlot("reviewInsightsSlotTitle")}
      description={tSlot("reviewInsightsSlotDescription")}
      count={signalCount}
      isRtl={isRtl}
      headerBorderClass="border-rose-400/20"
      iconClassName="text-rose-400/80"
      bodyClassName="bg-white/[0.02]"
      headerStatusWarning={
        syncAttention ? tSlot("syncExpiredHeaderWarning") : undefined
      }
    >
      {cards.length === 0 ? (
        <ActiveContextSlotEmpty
          message={tSlot("noActiveSignals")}
          ctaLabel={showSyncCta ? tSlot("reviewInsightsSyncCta") : undefined}
          ctaHref={showSyncCta ? `/app/${workspaceId}/reviews` : undefined}
          ctaClassName="border-rose-500/20 bg-rose-500/[0.06] text-rose-200/70 hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-100/90"
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
              <ReviewInsightChipRow
                key={insight.id}
                text={insight.title}
                categoryLabel={t(`categories.${insight.category}`)}
                severityLabel={severityLabel}
                severity={insight.severity}
                isRtl={isRtl}
                adopted={adopted}
                busy={busy}
                adoptEnabled={adoptEnabled}
                onAdopt={adopted ? undefined : () => onAdopt(insight)}
                onDismiss={adopted ? undefined : () => onDismiss(insight.id)}
                dismissLabel={t("dismiss")}
                adoptLabel={adopted ? t("inActiveContext") : t("adopt")}
              />
            );
          })}
        </ActiveContextSignalList>
      )}
    </ActiveContextSlot>
  );
}
