/**
 * Keyword Curation Floating Action Bar
 *
 * Shows when keywords are selected. Displays:
 * - Selection count with breakdown by category
 * - Clear button
 * - Send to AI Optimizer button
 *
 * Features:
 * - Only visible when selectedCount > 0
 * - Smooth entrance/exit animations
 * - RTL/LTR support
 * - Loading state during submission
 * - Error handling with user feedback
 * - Multilingual labels (EN/AR)
 */

"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Trash2, AlertCircle } from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addSignalToVault } from "@/lib/staging-vault/staging-vault-service";
import type { KeywordPayload, KeywordCategory } from "@/hooks/useKeywordSelection";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export interface KeywordCurationFloatingBarProps {
  isRtl?: boolean;
  selectedCount: number;
  countByCategory: Record<KeywordCategory, number>;
  selectedKeywords: KeywordPayload[];
  workspaceId: string;
  appId?: string;
  competitorId: string;
  competitorName: string;
  onClear: () => void;
  formattedSummary: string;
  onSuccess?: (signalId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Get localized labels
 */
function getLocales(locale: string) {
  return locale === "ar"
    ? {
        selectedCount: (count: number) => `${count} كلمة مختارة`,
        clearButton: "مسح",
        sendButton: "إرسال للمحسِّن",
        sendingButton: "جاري الإرسال...",
        success: "تم إرسال الكلمات المختارة إلى محسِّن القائمة",
        error: "فشل إرسال الكلمات. حاول مرة أخرى.",
        invalidPayload: "البيانات غير صالحة. تأكد من أن جميع الكلمات لها فئة.",
      }
    : {
        selectedCount: (count: number) => `${count} Keywords Selected`,
        clearButton: "Clear",
        sendButton: "Send to AI Optimizer",
        sendingButton: "Sending...",
        success: "Keywords sent to AI Listing Optimizer",
        error: "Failed to send keywords. Please try again.",
        invalidPayload: "Invalid data. Ensure all keywords have a category.",
      };
}

/**
 * Format keyword summary for display
 */
function formatSummaryForDisplay(
  selectedKeywords: KeywordPayload[],
  locale: string
): string {
  if (selectedKeywords.length === 0) return "";

  const categoryLabels = {
    high_volume: locale === "ar" ? "عالي الحجم" : "High-Volume",
    intent_based: locale === "ar" ? "موجه بالنية" : "Intent-Based",
    competitor_gap: locale === "ar" ? "فجوة تنافسية" : "Competitor Gap",
  };

  const breakdown: Record<KeywordCategory, number> = {
    high_volume: 0,
    intent_based: 0,
    competitor_gap: 0,
  };

  selectedKeywords.forEach(({ category }) => {
    breakdown[category as KeywordCategory]++;
  });

  const parts = Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(
      ([category, count]) =>
        `${count} ${categoryLabels[category as KeywordCategory]}`
    );

  return parts.join(" • ");
}

/**
 * Keyword Curation Floating Action Bar Component
 */
export function KeywordCurationFloatingBar({
  isRtl = false,
  selectedCount,
  countByCategory,
  selectedKeywords,
  workspaceId,
  appId,
  competitorId,
  competitorName,
  onClear,
  formattedSummary,
  onSuccess,
  onError,
}: KeywordCurationFloatingBarProps) {
  const locale = useLocale();
  const labels = getLocales(locale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  const handleSend = async () => {
    if (selectedKeywords.length === 0) {
      const errorMsg = labels.invalidPayload;
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // VALIDATION: Ensure all keywords have required fields
    // ═════════════════════════════════════════════════════════════════════════
    const allValid = selectedKeywords.every(
      (kw) => kw.term && typeof kw.term === "string" && kw.term.trim().length > 0 &&
              kw.category && typeof kw.category === "string" && kw.category.trim().length > 0
    );

    if (!allValid) {
      const errorMsg = labels.invalidPayload;
      setError(errorMsg);
      console.error("[KeywordCurationFloatingBar] Invalid keyword payload:", {
        selectedKeywords,
        errors: selectedKeywords
          .map((kw, idx) => {
            const issues = [];
            if (!kw.term || kw.term.trim().length === 0) issues.push("missing/empty term");
            if (!kw.category || kw.category.trim().length === 0) issues.push("missing/empty category");
            return issues.length > 0 ? `[${idx}]: ${issues.join(", ")}` : null;
          })
          .filter(Boolean),
      });
      toast.error(errorMsg);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log("[KeywordCurationFloatingBar] Sending keywords to vault:", {
        count: selectedKeywords.length,
        workspaceId,
        appId,
        competitorId,
        language: locale === "ar" ? "ar" : "en",
      });

      // ═════════════════════════════════════════════════════════════════════════
      // CALL: addSignalToVault with optimizer_selection signal type
      // This will trigger the validation gatekeeper in staging-vault-service
      // ═════════════════════════════════════════════════════════════════════════
      const result = await addSignalToVault(
        supabase,
        workspaceId,
        {
          signalType: "optimizer_selection",
          content: `Selected ${selectedKeywords.length} keywords from ${competitorName} analysis`,
          source: "manual",
          sourceAppId: appId,
          sourceContext: competitorId,
          sourceContextId: competitorId,
          language: locale === "ar" ? "ar" : "en",
          metadata: {
            competitor_id: competitorId,
            competitor_name: competitorName,
            selected_at: new Date().toISOString(),
            app_id: appId,
          },
          keywords: selectedKeywords,
        }
      );

      console.log("[KeywordCurationFloatingBar] Signal staged successfully:", {
        signalId: result.id,
        message: result.message,
      });

      toast.success(labels.success);
      onSuccess?.(result.id);

      // Clear selection after successful send
      onClear();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : labels.error;
      setError(errorMsg);
      console.error("[KeywordCurationFloatingBar] Error sending keywords:", {
        error: err instanceof Error ? err.message : String(err),
        selectedKeywords,
      });
      toast.error(errorMsg);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        className={cn(
          "fixed bottom-6 inset-x-6 md:inset-x-auto md:bottom-6 md:right-6 md:left-auto md:w-96",
          "z-40 pointer-events-auto"
        )}
      >
        {/* Background Card */}
        <motion.div
          layoutId="floating-bar-bg"
          className={cn(
            "w-full rounded-2xl border backdrop-blur-lg",
            "bg-gradient-to-b from-emerald-950/40 to-emerald-900/20",
            "border-emerald-500/30 shadow-2xl",
            isRtl && "direction-rtl"
          )}
        >
          <div className={cn(
            "p-4 space-y-3",
            isRtl && "text-right"
          )}>
            {/* Header: Selected Count */}
            <div className={cn(
              "flex items-center justify-between gap-3",
              isRtl && "flex-row-reverse"
            )}>
              <div>
                <p className="text-sm font-semibold text-emerald-100">
                  {labels.selectedCount(selectedCount)}
                </p>
                {formattedSummary && (
                  <p className="text-xs text-emerald-300/70 mt-1">
                    {formattedSummary}
                  </p>
                )}
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClear}
                className={cn(
                  "p-2 rounded-lg",
                  "bg-zinc-900/50 hover:bg-zinc-800/80",
                  "border border-zinc-700/50",
                  "text-zinc-400 hover:text-zinc-300",
                  "transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                )}
                disabled={isSubmitting}
                title={locale === "ar" ? "مسح" : "Clear"}
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Error Message (if any) */}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "p-3 rounded-lg flex gap-2 items-start",
                  "bg-red-500/15 border border-red-500/30"
                )}
              >
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </motion.div>
            )}

            {/* Action Button */}
            <motion.button
              whileHover={!isSubmitting ? { scale: 1.02 } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
              onClick={handleSend}
              disabled={isSubmitting}
              className={cn(
                "w-full py-2.5 px-4 rounded-lg",
                "font-medium text-sm transition-all duration-150",
                "flex items-center justify-center gap-2",
                isRtl && "flex-row-reverse",
                !isSubmitting
                  ? "bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-100 cursor-pointer"
                  : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 opacity-60 cursor-wait"
              )}
            >
              {isSubmitting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-4 h-4"
                  >
                    <Send className="w-4 h-4" />
                  </motion.div>
                  <span>{labels.sendingButton}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{labels.sendButton}</span>
                </>
              )}
            </motion.button>

            {/* Helper Text */}
            <p className={cn(
              "text-xs text-zinc-500",
              isRtl && "text-right"
            )}>
              {locale === "ar"
                ? "سيتم إرسال الكلمات المختارة إلى محسِّن القائمة للمعالجة"
                : "Selected keywords will be sent to the AI Listing Optimizer for processing"}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default KeywordCurationFloatingBar;
