/**
 * Alerts Staging Button
 *
 * Stages an alert to the Staging Vault with high-priority flag.
 * Used in: Alerts Panel - next to each detected alert
 */

"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";

interface AlertsStagingButtonProps {
  workspaceId: string;
  appId: string;
  alertId: string;
  alertType: string; // "keyword_rank_drop", "sentiment_shift", etc.
  alertTitle: string; // User-friendly title
  alertBody: string; // Full alert description
  severity: string; // "critical", "warning", "info"
  language?: string; // "en", "ar"
  onStaged?: () => void;
  className?: string;
  label?: string;
}

const ALERT_TYPE_LABELS: Record<string, Record<string, string>> = {
  keyword_rank_drop: { en: "Keyword Rank Drop", ar: "انخفاض ترتيب الكلمة المفتاحية" },
  sentiment_shift: { en: "Sentiment Shift", ar: "تغيير المشاعر" },
  rating_decline: { en: "Rating Decline", ar: "انخفاض التقييم" },
  crash_spike: { en: "Crash Spike", ar: "ارتفاع الأعطال" },
  competitor_mention: { en: "Competitor Mention", ar: "ذكر المنافس" },
  review_surge: { en: "Review Surge", ar: "ارتفاع المراجعات" },
  security_issue: { en: "Security Issue", ar: "مشكلة أمان" },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-rose-500/15 hover:bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/20",
  warning:
    "bg-amber-500/15 hover:bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/20",
  info: "bg-blue-500/15 hover:bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/20",
};

export function AlertsStagingButton({
  workspaceId,
  appId,
  alertId,
  alertType,
  alertTitle,
  alertBody,
  severity,
  language = "en",
  onStaged,
  className,
  label,
}: AlertsStagingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [staged, setStaged] = useState(false);
  const { showToast } = useToast();

  const isRtl = ["ar", "he", "fa", "ur"].includes(language);
  const alertTypeLabel =
    ALERT_TYPE_LABELS[alertType]?.[language] ||
    alertType.replace(/_/g, " ");

  const handleStage = async () => {
    if (loading || staged) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalType: "optimization_insight",
            content: `[${severity.toUpperCase()}] ${alertTypeLabel}: ${alertBody}`,
            source: "api",
            sourceAppId: appId,
            sourceContext: "alert",
            sourceContextId: alertId,
            language,
            metadata: {
              alertType,
              alertTitle,
              severity,
              highPriority: severity === "critical",
              detectedAt: new Date().toISOString(),
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to stage alert: ${response.status}`);
      }

      const data = await response.json();
      setStaged(true);

      const titleKey = language === "ar" ? "تمت الإضافة بنجاح" : "Alert Staged";
      const messageKey =
        language === "ar"
          ? `تمت إضافة التنبيه: ${alertTypeLabel}`
          : `${alertTypeLabel} (${severity}) staged`;

      showToast({
        type: "success",
        title: titleKey,
        message: messageKey,
        duration: 3000,
      });

      onStaged?.();
    } catch (error) {
      console.error("[AlertsStaging] Error:", error);

      showToast({
        type: "error",
        title: language === "ar" ? "خطأ في الإضافة" : "Failed to Stage",
        message:
          error instanceof Error
            ? error.message
            : language === "ar"
              ? "حدث خطأ. حاول مجددا."
              : "An error occurred. Try again.",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const severityColor =
    SEVERITY_COLORS[severity] ||
    "bg-zinc-700/15 hover:bg-zinc-700/20 text-zinc-300 ring-1 ring-zinc-700/20";

  return (
    <button
      onClick={handleStage}
      disabled={loading || staged}
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "rounded-lg px-3 py-1.5 text-xs font-medium",
        "transition-all duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-offset-1",
        staged ? "bg-emerald-500/20 text-emerald-300" : severityColor,
        className
      )}
      title={label || alertTitle}
      aria-label={label || alertTitle}
    >
      {staged ? (
        <>
          <Check className="size-3.5 shrink-0" />
          <span>{language === "ar" ? "مرحلة" : "Staged"}</span>
        </>
      ) : loading ? (
        <>
          <Loader2 className="size-3.5 animate-spin shrink-0" />
          <span>{language === "ar" ? "جاري الإضافة..." : "Staging..."}</span>
        </>
      ) : (
        <span>{label || (language === "ar" ? "إضافة إلى الخزنة" : "Stage Alert")}</span>
      )}
    </button>
  );
}
