import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";
import { purgeReviewDerivedFromQueue } from "@/lib/optimization-queue/optimization-queue.service";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import {
  inferCategoryFromIssue,
  normalizeReviewInsightCategory,
  type IssueItemWithCategory,
  type PendingReviewInsight,
  type ReviewInsightCategory,
} from "@/lib/review-insights/pending-insights.types";

type ClusterKey = {
  workspaceId: string;
  packageName: string;
  langCode: string;
  country: string;
};

type SavePendingInput = ClusterKey & {
  competitorInsightsId: string;
  analysisTransactionId: string;
  issues: IssueItem[];
  locale: OptimizationQueueLocale;
  appId?: string | null;
  userId?: string;
};

function mapRow(row: Record<string, unknown>): PendingReviewInsight {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    competitorInsightsId:
      row.competitor_insights_id != null ? String(row.competitor_insights_id) : null,
    analysisTransactionId:
      row.analysis_transaction_id != null ? String(row.analysis_transaction_id) : null,
    packageName: String(row.package_name),
    langCode: String(row.lang_code),
    country: String(row.country),
    title: String(row.title),
    description: String(row.description),
    severity: String(row.severity) as PendingReviewInsight["severity"],
    impact: Number(row.impact),
    quote: typeof row.quote === "string" ? row.quote : "",
    category: normalizeReviewInsightCategory(row.category),
    status: String(row.status) as PendingReviewInsight["status"],
    queueItemId: typeof row.queue_item_id === "string" ? row.queue_item_id : null,
    clusterIndex: typeof row.cluster_index === "number" ? row.cluster_index : 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function withCategory(issue: IssueItem): IssueItemWithCategory {
  const category =
    "category" in issue && issue.category
      ? normalizeReviewInsightCategory((issue as IssueItemWithCategory).category)
      : inferCategoryFromIssue(issue);
  return { ...issue, category };
}

/**
 * After paid Sync Insights: replace curation rows for this cluster.
 * Does NOT write to Active Context — user Adopt commits each insight.
 */
export async function savePendingReviewInsights(
  supabase: SupabaseClient,
  input: SavePendingInput,
): Promise<{ savedCount: number }> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  await purgeReviewDerivedFromQueue(supabase, input.workspaceId, input.locale, {
    appId: input.appId,
    userId: input.userId,
  });

  await admin
    .from("review_pending_insights")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("package_name", input.packageName)
    .eq("lang_code", input.langCode)
    .eq("country", input.country);

  const categorized = input.issues.map(withCategory);
  if (categorized.length === 0) {
    return { savedCount: 0 };
  }

  const rows = categorized.map((issue, index) => ({
    workspace_id: input.workspaceId,
    competitor_insights_id: input.competitorInsightsId,
    analysis_transaction_id: input.analysisTransactionId,
    package_name: input.packageName,
    lang_code: input.langCode,
    country: input.country,
    title: issue.title,
    description: issue.description,
    severity: issue.severity,
    impact: issue.impact,
    quote: issue.quote,
    category: issue.category,
    status: "pending",
    cluster_index: index,
    created_at: now,
    updated_at: now,
  }));

  const { error } = await admin.from("review_pending_insights").insert(rows);
  if (error) {
    console.error("[savePendingReviewInsights] insert failed:", error.message);
    throw new Error("Failed to save pending review insights");
  }

  return { savedCount: rows.length };
}

export async function listPendingReviewInsights(
  supabase: SupabaseClient,
  cluster: ClusterKey,
  options?: {
    analysisTransactionId?: string | null;
    statuses?: Array<PendingReviewInsight["status"]>;
  },
): Promise<PendingReviewInsight[]> {
  let query = supabase
    .from("review_pending_insights")
    .select("*")
    .eq("workspace_id", cluster.workspaceId)
    .eq("package_name", cluster.packageName)
    .eq("lang_code", cluster.langCode)
    .eq("country", cluster.country)
    .order("cluster_index", { ascending: true });

  if (options?.analysisTransactionId) {
    query = query.eq("analysis_transaction_id", options.analysisTransactionId);
  }

  if (options?.statuses?.length) {
    query = query.in("status", options.statuses);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[listPendingReviewInsights] read failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getPendingReviewInsightById(
  supabase: SupabaseClient,
  workspaceId: string,
  insightId: string,
): Promise<PendingReviewInsight | null> {
  const { data, error } = await supabase
    .from("review_pending_insights")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", insightId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function dismissPendingReviewInsight(
  supabase: SupabaseClient,
  workspaceId: string,
  insightId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("review_pending_insights")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", insightId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  return !error && Boolean(data);
}

export function pendingInsightToIssueItem(insight: PendingReviewInsight): IssueItemWithCategory {
  return {
    title: insight.title,
    description: insight.description,
    severity: insight.severity,
    impact: insight.impact,
    quote: insight.quote,
    category: insight.category,
  };
}

export type { ReviewInsightCategory };
