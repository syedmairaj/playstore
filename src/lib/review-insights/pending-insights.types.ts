import type { IssueItem, IssueSeverity } from "@/lib/gemini/generate-review-analysis";
import type { GrowthStrategyTag } from "@/lib/review-insights/growth-strategy-tags";

/** ASO cluster categories returned by review analysis. */
export type ReviewInsightCategory =
  | "UX"
  | "CRASHES"
  | "ACCURACY"
  | "PERFORMANCE"
  | "PRICING"
  | "FEATURES";

export const REVIEW_INSIGHT_CATEGORIES: readonly ReviewInsightCategory[] = [
  "UX",
  "CRASHES",
  "ACCURACY",
  "PERFORMANCE",
  "PRICING",
  "FEATURES",
] as const;

export type PendingInsightStatus = "pending" | "adopted" | "dismissed";

export type PendingReviewInsight = {
  id: string;
  workspaceId: string;
  competitorInsightsId: string | null;
  analysisTransactionId: string | null;
  packageName: string;
  langCode: string;
  country: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  impact: number;
  quote: string;
  category: ReviewInsightCategory;
  status: PendingInsightStatus;
  queueItemId: string | null;
  clusterIndex: number;
  createdAt: string;
  updatedAt: string;
  /** ASO Growth: defensive product fix vs offensive competitor exploit. */
  growthStrategyTag?: GrowthStrategyTag;
  impactPercent?: number;
};

export type IssueItemWithCategory = IssueItem & {
  category: ReviewInsightCategory;
};

export function normalizeReviewInsightCategory(raw: unknown): ReviewInsightCategory {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if ((REVIEW_INSIGHT_CATEGORIES as readonly string[]).includes(value)) {
    return value as ReviewInsightCategory;
  }
  return "UX";
}

export function inferCategoryFromIssue(issue: IssueItem): ReviewInsightCategory {
  const haystack = `${issue.title} ${issue.description}`.toLowerCase();
  if (/crash|freeze|bug|error|broken|fail/.test(haystack)) return "CRASHES";
  if (/slow|lag|battery|performance|load/.test(haystack)) return "PERFORMANCE";
  if (/price|subscription|pay|cost|billing/.test(haystack)) return "PRICING";
  if (/feature|request|missing|need|want/.test(haystack)) return "FEATURES";
  if (/accura|wrong|incorrect|data|sync/.test(haystack)) return "ACCURACY";
  if (issue.severity === "CRITICAL") return "CRASHES";
  return "UX";
}
