/** Review analysis feature constants (Review → Listing pipeline). */

import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";

export const REVIEW_ANALYSIS_CREDIT_COST = AI_CREDIT_COSTS.reviews_issue_analysis;

/** Gamified monthly cap shown in UI (calendar month, UTC). */
export const REVIEW_ANALYSIS_MONTHLY_LIMIT = 5;

/** Max pain points auto-bridged to Active Context per analysis run. */
export const REVIEW_BRIDGE_TOP_N = 5;

export const REVIEW_ANALYSIS_FEATURE = "reviews_issue_analysis" as const;

/** Cache TTL for paid review analysis (matches reviews/analyze route). */
export const REVIEW_ANALYSIS_CACHE_TTL_HOURS = 168;
export const REVIEW_ANALYSIS_CACHE_TTL_MS =
  REVIEW_ANALYSIS_CACHE_TTL_HOURS * 60 * 60 * 1000;

export const REVIEW_ANALYSIS_STATUS_SUCCESS = "SUCCESS_PAID" as const;
