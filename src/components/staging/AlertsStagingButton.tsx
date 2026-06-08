/**
 * Alerts → Staging Vault Button Component
 *
 * Used in: Alerts page, next to each alert
 * Behavior: POST to staging/add with alert metadata, show success toast
 */

"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { AppAlert } from "@/lib/staging-vault/alerts-staging";

interface Props {
  workspaceId: string;
  appId: string;
  alert: AppAlert;
  onStaged?: (alertId: string) => void;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  sentiment_drop: "Sentiment Drop",
  crash_spike: "Crash Spike",
  rating_decline: "Rating Decline",
  review_surge: "Review Surge",
  keyword_drop: "Keyword Drop",
  competitor_mention: "Competitor Mentioned",
  security_issue: "Security Issue",
};

export function AlertsStagingButton({
  workspaceId,
  appId,
  alert,
  onStaged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleStageAlert = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalType: "optimization_insight",
            content: `[${alert.severity.toUpperCase()}] ${ALERT_TYPE_LABELS[alert.alertType] || alert.alertType}: ${alert.description}`,
            source: "api",
            sourceAppId: appId,
            sourceContext: "alert",
            sourceContextId: alert.id,
            language: alert.language || "en",
            metadata: {
              alertType: alert.alertType,
              severity: alert.severity,
              detectedAt: alert.detectedAt,
              resolvedAt: alert.resolvedAt,
              locale: alert.locale,
              countryCode: alert.countryCode,
              previousValue: alert.context.previousValue,
              currentValue: alert.context.currentValue,
              changePercent: alert.context.changePercent,
              affectedCountries: alert.context.affectedCountries,
              competitorName: alert.context.competitorName,
              category: alert.context.category,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to stage alert: ${response.status}`);
      }

      const data = await response.json();

      showToast({
        type: "success",
        title: "Alert Staged",
        message: `${ALERT_TYPE_LABELS[alert.alertType] || alert.alertType} (${alert.severity})`,
        duration: 3000,
      });

      onStaged?.(alert.id);
    } catch (error) {
      console.error("[AlertStaging] Error:", error);
      showToast({
        type: "error",
        title: "Failed to Stage",
        message:
          error instanceof Error
            ? error.message
            : "Could not stage alert. Try again.",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleStageAlert}
      disabled={loading}
      className="px-3 py-1.5 text-sm font-medium rounded bg-amber-50 hover:bg-amber-100 text-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title={`Stage this ${alert.severity} alert to optimizer vault`}
    >
      {loading ? "Staging..." : "Stage"}
    </button>
  );
}
