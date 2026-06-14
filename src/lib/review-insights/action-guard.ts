import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readWorkspaceAiCreditsRemaining,
  buildInsufficientAiCreditsPayload,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  REVIEW_ANALYSIS_CREDIT_COST,
  REVIEW_ANALYSIS_MONTHLY_LIMIT,
} from "@/lib/review-insights/constants";
import { readReviewAnalysisUsage } from "@/lib/review-insights/monthly-usage";

export type ReviewAnalysisGuardDenyReason =
  | "insufficient_credits"
  | "monthly_limit_reached";

export type ReviewAnalysisGuardResult =
  | {
      allowed: true;
      creditCost: number;
      creditsRemaining: number;
      monthlyUsed: number;
      monthlyLimit: number;
    }
  | {
      allowed: false;
      reason: ReviewAnalysisGuardDenyReason;
      topUpRequired: boolean;
      creditCost: number;
      creditsRemaining: number;
      monthlyUsed: number;
      monthlyLimit: number;
      payload?: ReturnType<typeof buildInsufficientAiCreditsPayload>;
    };

/**
 * Pre-flight guard before Vertex/Gemini review analysis + ReviewInsightBridge.
 * Credits are required; monthly usage is tracked for gamification and soft cap.
 */
export async function guardReviewAnalysisAction(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ReviewAnalysisGuardResult> {
  const creditCost = REVIEW_ANALYSIS_CREDIT_COST;
  const monthlyLimit = REVIEW_ANALYSIS_MONTHLY_LIMIT;

  const [creditsResult, monthly] = await Promise.all([
    readWorkspaceAiCreditsRemaining(supabase, workspaceId),
    readReviewAnalysisUsage(supabase, workspaceId),
  ]);

  if (!creditsResult.ok) {
    return {
      allowed: false,
      reason: "insufficient_credits",
      topUpRequired: true,
      creditCost,
      creditsRemaining: 0,
      monthlyUsed: monthly.used,
      monthlyLimit,
    };
  }

  if (monthly.used >= monthlyLimit) {
    return {
      allowed: false,
      reason: "monthly_limit_reached",
      topUpRequired: false,
      creditCost,
      creditsRemaining: creditsResult.remaining,
      monthlyUsed: monthly.used,
      monthlyLimit,
    };
  }

  if (creditsResult.remaining < creditCost) {
    return {
      allowed: false,
      reason: "insufficient_credits",
      topUpRequired: true,
      creditCost,
      creditsRemaining: creditsResult.remaining,
      monthlyUsed: monthly.used,
      monthlyLimit,
      payload: buildInsufficientAiCreditsPayload(creditCost, creditsResult.remaining),
    };
  }

  return {
    allowed: true,
    creditCost,
    creditsRemaining: creditsResult.remaining,
    monthlyUsed: monthly.used,
    monthlyLimit,
  };
}
