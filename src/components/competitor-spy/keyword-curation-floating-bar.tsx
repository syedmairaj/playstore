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

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Trash2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { KeywordPayload, KeywordCategory } from "@/hooks/useKeywordSelection";
import { createClient } from "@/lib/supabase/client";
import {
  stageKeywordsNoNavigation,
  getStagingFlowMessages,
  buildStagingToastMessage,
  buildOptimizerActionUrl,
  formatStagedKeywordsPreview,
} from "@/lib/client/competitor-spy-staging-flow";

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
  // NEW: Optional callback when staging succeeds (for showing action prompt)
  onStagingComplete?: (signalId: string, stagedCount: number) => void;
}

/**
 * Get localized labels for component
 */
function getComponentLabels(locale: string) {
  return locale === "ar"
    ? {
        selectedCount: (count: number) => `${count} كلمة مختارة`,
        clearButton: "مسح",
        sendButton: "إرسال للمحسِّن",
        sendingButton: "جاري الإرسال...",
        goToOptimizer: "انتقل إلى المحسِّن",
        continueLater: "المتابعة لاحقاً",
        helperText: "سيتم إرسال الكلمات المختارة إلى محسِّن القائمة للمعالجة",
        successDetail: (count: number, competitor: string) =>
          `تم إرسال ${count} كلمة من تحليل ${competitor}`,
        hint: "يمكنك إضافة المزيد من الإشارات قبل الإنشاء",
      }
    : {
        selectedCount: (count: number) => `${count} Keywords Selected`,
        clearButton: "Clear",
        sendButton: "Send to AI Optimizer",
        sendingButton: "Sending...",
        goToOptimizer: "Go to Optimizer",
        continueLater: "Continue Later",
        helperText: "Selected keywords will be sent to the AI Listing Optimizer for processing",
        successDetail: (count: number, competitor: string) =>
          `Sent ${count} keywords from ${competitor} analysis`,
        hint: "You can add more signals before generating",
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
  onStagingComplete,
}: KeywordCurationFloatingBarProps) {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const labels = getComponentLabels(locale);
  const stagingMessages = getStagingFlowMessages(locale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPostStagingPrompt, setShowPostStagingPrompt] = useState(false);
  const [stagedSignalId, setStagedSignalId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const handleSend = async () => {
    if (selectedKeywords.length === 0) {
      toast.error(stagingMessages.emptySelection);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log("[KeywordCurationFloatingBar] 📍 STAGING KEYWORDS (NO NAVIGATION):", {
        count: selectedKeywords.length,
        workspaceId,
        competitorId,
        competitorName,
        appId,
        locale,
      });

      // ═════════════════════════════════════════════════════════════════════════
      // CALL: Stage keywords WITHOUT forcing navigation
      // User stays in Competitor Spy, can continue adding signals
      // ═════════════════════════════════════════════════════════════════════════
      const stagingResult = await stageKeywordsNoNavigation(
        supabase,
        workspaceId,
        selectedKeywords,
        competitorName,
        competitorId,
        appId,
        locale
      );

      if (!stagingResult.success) {
        console.warn("[KeywordCurationFloatingBar] Staging failed:", {
          message: stagingResult.message,
          competitorId,
        });
        toast.error(stagingResult.message);
        setError(stagingResult.message);
        onError?.(new Error(stagingResult.message));
        return;
      }

      // ═════════════════════════════════════════════════════════════════════════
      // SUCCESS: Show confirmation toast with action suggestions
      // ═════════════════════════════════════════════════════════════════════════
      console.log("[KeywordCurationFloatingBar] ✅ STAGING SUCCESSFUL:", {
        signalId: stagingResult.signalId,
        keywordCount: selectedKeywords.length,
        competitorName,
      });

      // ✅ CRITICAL: Invalidate optimizer context query
      // This forces the AI Listing Optimizer component to refetch the active context
      // so it sees the newly staged keywords immediately
      console.log("[KeywordCurationFloatingBar] 🔄 INVALIDATING QUERY:", {
        queryKey: ["optimizer-context", workspaceId],
        workspaceId,
      });

      queryClient.invalidateQueries({
        queryKey: ["optimizer-context", workspaceId],
      });

      // Build enhanced toast message
      const [mainMsg, detailMsg] = buildStagingToastMessage(
        competitorName,
        selectedKeywords.length,
        locale
      );

      // Show success toast with callback for action
      toast.success(mainMsg, {
        description: detailMsg,
        duration: 5000,
        action: {
          label: labels.goToOptimizer,
          onClick: () => {
            handleNavigateToOptimizer();
          },
        },
      });

      // Store staged signal info for post-staging prompt
      if (stagingResult.signalId) {
        setStagedSignalId(stagingResult.signalId);
        setShowPostStagingPrompt(true);
      }

      // Notify parent component of successful staging
      onSuccess?.(stagingResult.signalId || "");
      onStagingComplete?.(stagingResult.signalId || "", selectedKeywords.length);

      // ⚠️ DO NOT CLEAR HERE - Let post-staging prompt show first
      // Clear is called after user chooses action (Continue or Go to Optimizer)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : stagingMessages.stagingFailed;
      console.error("[KeywordCurationFloatingBar] Staging error:", {
        error: errorMsg,
        competitorId,
      });
      toast.error(errorMsg);
      setError(errorMsg);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNavigateToOptimizer = () => {
    const optimizerUrl = buildOptimizerActionUrl(workspaceId);
    console.log("[KeywordCurationFloatingBar] 🔗 Navigating to optimizer:", {
      url: optimizerUrl,
      stagedSignalId,
    });
    setShowPostStagingPrompt(false);
    // Clear keyword selection before navigating
    onClear();
    // Navigate to optimizer
    router.push(optimizerUrl);
  };

  const handleContinueStaging = () => {
    console.log("[KeywordCurationFloatingBar] Continuing to add more signals");
    setShowPostStagingPrompt(false);
    // Clear selection so user can select more keywords
    onClear();
  };

  if (selectedCount === 0 && !showPostStagingPrompt) {
    return null;
  }

  // If showing post-staging prompt, render action dialog instead
  if (showPostStagingPrompt) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "fixed bottom-6 inset-x-6 md:inset-x-auto md:bottom-6 md:right-6 md:left-auto md:w-96",
            "z-40 pointer-events-auto"
          )}
        >
          <motion.div
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
              {/* Success Header */}
              <div className={cn(
                "flex items-center gap-2",
                isRtl && "flex-row-reverse"
              )}>
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-emerald-100">
                  {stagingMessages.stagingSuccess}
                </p>
              </div>

              {/* Hint about adding more signals */}
              <p className="text-xs text-zinc-400 leading-relaxed">
                {stagingMessages.continueStagingHint}
              </p>

              {/* Action Buttons */}
              <div className={cn(
                "flex gap-2",
                isRtl && "flex-row-reverse"
              )}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNavigateToOptimizer}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg",
                    "bg-emerald-500/20 hover:bg-emerald-500/30",
                    "border border-emerald-500/50",
                    "text-emerald-100 text-sm font-medium",
                    "flex items-center justify-center gap-2",
                    isRtl && "flex-row-reverse",
                    "transition-all duration-150"
                  )}
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{labels.goToOptimizer}</span>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleContinueStaging}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg",
                    "bg-zinc-900/50 hover:bg-zinc-800/80",
                    "border border-zinc-700/50",
                    "text-zinc-400 hover:text-zinc-300 text-sm font-medium",
                    "transition-all duration-150"
                  )}
                >
                  {labels.continueLater}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
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
            <div className={cn(
              "space-y-1",
              isRtl && "text-right"
            )}>
              <p className="text-xs text-zinc-500">
                {labels.helperText}
              </p>
              <p className="text-xs text-emerald-300/60 font-medium">
                {labels.hint}
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default KeywordCurationFloatingBar;
