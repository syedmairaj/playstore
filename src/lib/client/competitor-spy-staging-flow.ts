/**
 * Competitor Spy → AI Listing Optimizer Staging Flow
 *
 * Replaces direct navigation with state-based staging:
 * 1. User selects keywords in Competitor Spy
 * 2. Clicks "Send to AI Optimizer"
 * 3. Keywords are staged in ActiveContext (not navigation)
 * 4. Success toast confirms staging
 * 5. User can continue adding more signals
 * 6. User navigates to Optimizer manually and clicks "Generate"
 *
 * Features:
 * - ✅ No forced navigation (user stays in Competitor Spy)
 * - ✅ Bilingual toast messages (EN/AR)
 * - ✅ Integration with staging-vault-service
 * - ✅ Type-safe keyword payloads
 * - ✅ Workspace isolation via Supabase RLS
 * - ✅ Metadata tracking (competitor name, selected keywords count)
 *
 * This is the recommended pattern for ASO tools where users
 * accumulate multiple signal types before generating.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { KeywordPayload } from "@/hooks/useKeywordSelection";

/**
 * Staging result type
 */
export interface StagingResult {
  success: boolean;
  signalId?: string;
  message: string;
  timestamp: string;
  language: "en" | "ar";
}

/**
 * Get localized messages for the staging flow
 */
export function getStagingFlowMessages(locale: string) {
  const isArabic = locale === "ar";

  return {
    // Success messages
    stagingSuccess: isArabic
      ? "تمت الإضافة إلى طابور التحسين"
      : "Added to Optimization Queue",

    stagingSuccessDetail: isArabic
      ? (count: number, competitorName: string) =>
          `تم إرسال ${count} كلمة من تحليل ${competitorName}`
      : (count: number, competitorName: string) =>
          `Sent ${count} keywords from ${competitorName} analysis`,

    continueStagingHint: isArabic
      ? "يمكنك إضافة المزيد من الإشارات إلى الطابور قبل التوليد"
      : "You can add more signals to the queue before generating",

    // Error messages
    stagingFailed: isArabic
      ? "فشل إرسال الكلمات. حاول مرة أخرى."
      : "Failed to stage keywords. Please try again.",

    invalidKeywords: isArabic
      ? "بيانات الكلمات غير صالحة. تأكد من أن لكل كلمة فئة."
      : "Invalid keyword data. Ensure all keywords have a category.",

    emptySelection: isArabic
      ? "لم يتم اختيار أي كلمات"
      : "No keywords selected",

    networkError: isArabic
      ? "خطأ في الاتصال. تأكد من الإنترنت."
      : "Network error. Please check your connection.",

    // Confirmation messages
    navigateToOptimizer: isArabic
      ? "انتقل إلى محسِّن القائمة لمراجعة الطابور"
      : "Go to Listing Optimizer to review the queue",

    generateNow: isArabic
      ? "إنشاء الآن"
      : "Generate Now",

    continueLater: isArabic
      ? "المتابعة لاحقاً"
      : "Continue Later",

    deprecatedStrengthStaging: isArabic
      ? "تم إيقاف إضافة نقاط القوة من هنا. اعتمد الإشارات عالية التأثير من قائمة تدقيق مشاعر المراجعات أدناه."
      : "Direct strength staging is deprecated. Approve high-impact signals from the Review Sentiment Audit Queue instead.",
  };
}

/**
 * Stage keyword selection without navigation
 *
 * This function:
 * 1. Validates keyword payloads
 * 2. Stores in staging vault via addSignalToVault
 * 3. Returns success/failure result
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param selectedKeywords - Selected keyword payloads
 * @param competitorName - Name of competitor (for metadata)
 * @param competitorId - ID of competitor (for tracking)
 * @param appId - Target app ID (for staging)
 * @param locale - Locale for messages (en/ar)
 * @returns Staging result with signal ID
 */
export async function stageKeywordsNoNavigation(
  _supabase: SupabaseClient,
  _workspaceId: string,
  _selectedKeywords: KeywordPayload[],
  _competitorName: string,
  _competitorId: string,
  _appId: string | undefined,
  locale: string
): Promise<StagingResult> {
  const isArabic = locale === "ar";
  const messages = getStagingFlowMessages(locale);
  const timestamp = new Date().toISOString();

  // Legacy keyword curation → Competitor Strengths path is deprecated.
  return {
    success: false,
    message: messages.deprecatedStrengthStaging,
    timestamp,
    language: isArabic ? "ar" : "en",
  };
}

/**
 * Build enhanced toast message with action suggestion
 *
 * Returns a tuple of [main message, detail message] for structured toasts
 */
export function buildStagingToastMessage(
  competitorName: string,
  keywordCount: number,
  locale: string
): [string, string] {
  const messages = getStagingFlowMessages(locale);
  const mainMessage = messages.stagingSuccess;
  const detailMessage = messages.stagingSuccessDetail(keywordCount, competitorName);

  return [mainMessage, detailMessage];
}

/**
 * Build action URL for "Go to Optimizer" suggestion
 *
 * Returns the optimizer URL path (without locale prefix for next-intl compatibility)
 */
export function buildOptimizerActionUrl(workspaceId: string): string {
  return `/app/${workspaceId}/listing-optimizer`;
}

/**
 * Helper to create a "view staged keywords" shortcut
 * Shows user what keywords were just staged
 */
export function formatStagedKeywordsPreview(
  keywords: KeywordPayload[],
  maxDisplay: number = 3
): string {
  if (keywords.length === 0) return "";

  const displayed = keywords.slice(0, maxDisplay);
  const terms = displayed.map((kw) => kw.term).join(", ");

  if (keywords.length > maxDisplay) {
    return `${terms}... +${keywords.length - maxDisplay}`;
  }

  return terms;
}

/**
 * Type for staging flow state management
 * Use in React components for tracking staging status
 */
export interface StagingFlowState {
  isStaging: boolean;
  isStagingSuccess: boolean;
  stagingError: string | null;
  lastStagedSignalId: string | null;
  lastStagedCount: number;
}

/**
 * Initial state for staging flow
 */
export const INITIAL_STAGING_STATE: StagingFlowState = {
  isStaging: false,
  isStagingSuccess: false,
  stagingError: null,
  lastStagedSignalId: null,
  lastStagedCount: 0,
};
