/**
 * Reusable Stage Button Component
 *
 * Replaces legacy navigation-based "Send to Optimizer" buttons.
 * Handles RTL/LTR, loading states, error handling, and toast notifications.
 *
 * Usage:
 * <StageButton
 *   signalType="review_issue"
 *   content="App crashes on older devices"
 *   source="review_analysis"
 *   sourceAppId="app-123"
 *   workspaceId="ws-456"
 *   metadata={{ reviewScore: 4.2, issueCount: 5 }}
 *   onStaged={() => console.log('done')}
 * />
 */

"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "next-intl";
import { ChevronRight } from "lucide-react";

type SignalType = "keyword" | "review_issue" | "competitor_weakness" | "optimization_insight";
type SignalSource =
  | "keyword_spotlight"
  | "keyword_tracker"
  | "review_analysis"
  | "competitor_spy"
  | "manual"
  | "api";

interface StageButtonProps {
  signalType: SignalType;
  content: string;
  source: SignalSource;
  workspaceId: string;
  sourceAppId: string;
  metadata?: Record<string, any>;
  language?: string;
  onStaged?: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function StageButton({
  signalType,
  content,
  source,
  workspaceId,
  sourceAppId,
  metadata = {},
  language,
  onStaged,
  className = "",
  variant = "primary",
  size = "md",
  label,
}: StageButtonProps) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const locale = useLocale();

  // Use provided language or fallback to locale
  const effectiveLanguage = language || locale;
  const isRtl = ["ar", "he", "fa", "ur"].includes(effectiveLanguage);

  // Get button label based on signal type and language
  const getLabel = (): string => {
    if (label) return label;

    const labels: Record<SignalType, Record<string, string>> = {
      keyword: {
        en: "Stage to Vault",
        ar: "إضافة إلى الخزنة",
      },
      review_issue: {
        en: "Stage Issue",
        ar: "إضافة المشكلة",
      },
      competitor_weakness: {
        en: "Stage Weakness",
        ar: "إضافة نقطة الضعف",
      },
      optimization_insight: {
        en: "Stage Insight",
        ar: "إضافة الفكرة",
      },
    };

    const key = effectiveLanguage.startsWith("ar") ? "ar" : "en";
    return labels[signalType]?.[key] || "Stage";
  };

  const getStagingMessage = (): string => {
    const messages: Record<SignalType, Record<string, string>> = {
      keyword: {
        en: `Staged keyword: "${content}"`,
        ar: `تم إضافة الكلمة المفتاحية: "${content}"`,
      },
      review_issue: {
        en: `Staged issue: "${content}"`,
        ar: `تم إضافة المشكلة: "${content}"`,
      },
      competitor_weakness: {
        en: `Staged weakness: "${content}"`,
        ar: `تم إضافة نقطة الضعف: "${content}"`,
      },
      optimization_insight: {
        en: `Staged insight: "${content}"`,
        ar: `تم إضافة الفكرة: "${content}"`,
      },
    };

    const key = effectiveLanguage.startsWith("ar") ? "ar" : "en";
    return messages[signalType]?.[key] || `Staged to vault`;
  };

  const handleStage = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalType,
            content,
            source,
            sourceAppId,
            language: effectiveLanguage,
            metadata: {
              ...metadata,
              isRtl,
              directionality: isRtl ? "rtl" : "ltr",
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error.message || `Failed to stage: ${response.status}`
        );
      }

      const successTitle =
        effectiveLanguage.startsWith("ar") ? "تم الإضافة بنجاح" : "Successfully Staged";
      const successMessage = getStagingMessage();

      showToast({
        type: "success",
        title: successTitle,
        message: successMessage,
        duration: 3000,
      });

      onStaged?.();
    } catch (error) {
      console.error("[StageButton] Error:", error);

      const errorTitle =
        effectiveLanguage.startsWith("ar") ? "خطأ في الإضافة" : "Failed to Stage";
      const errorMessage =
        error instanceof Error
          ? error.message
          : effectiveLanguage.startsWith("ar")
            ? "حدث خطأ. حاول مجددا."
            : "An error occurred. Try again.";

      showToast({
        type: "error",
        title: errorTitle,
        message: errorMessage,
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Variant styles
  const variantStyles: Record<string, string> = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-900",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-700 border border-gray-300",
  };

  // Size styles
  const sizeStyles: Record<string, string> = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-2.5 text-base",
  };

  return (
    <button
      onClick={handleStage}
      disabled={loading}
      dir={isRtl ? "rtl" : "ltr"}
      className={`
        flex items-center justify-center gap-2
        font-medium rounded transition-all
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      title={getLabel()}
      aria-label={getLabel()}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
          <span>
            {effectiveLanguage.startsWith("ar") ? "جاري الإضافة..." : "Staging..."}
          </span>
        </>
      ) : (
        <>
          <span>{getLabel()}</span>
          {!isRtl ? <ChevronRight className="w-4 h-4" /> : null}
        </>
      )}
    </button>
  );
}

export default StageButton;
