import type { SupabaseClient } from "@supabase/supabase-js";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";
import { addToOptimizationQueue } from "@/lib/optimization-queue";
import type {
  AddOptimizationQueueInput,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue";
import { REVIEW_BRIDGE_TOP_N, REVIEW_ANALYSIS_STATUS_SUCCESS } from "@/lib/review-insights/constants";
import { purgeReviewDerivedFromQueue } from "@/lib/optimization-queue/optimization-queue.service";
import { resolveVaultAppId } from "@/lib/staging-vault/resolve-vault-app-id";

export type ReviewInsightBridgeInput = {
  workspaceId: string;
  packageName: string;
  country: string;
  langCode: string;
  locale: OptimizationQueueLocale;
  issues: IssueItem[];
  appId?: string | null;
  userId?: string;
  transactionId: string;
  lastAnalysisTimestamp: string;
};

export type ReviewInsightBridgeResult = {
  ok: boolean;
  bridgedCount: number;
  skippedCount: number;
  error?: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function mapIssuesToQueueInputs(
  issues: IssueItem[],
  ctx: Pick<
    ReviewInsightBridgeInput,
    "packageName" | "country" | "langCode" | "transactionId" | "lastAnalysisTimestamp"
  >,
): AddOptimizationQueueInput[] {
  return issues.slice(0, REVIEW_BRIDGE_TOP_N).map((issue) => ({
    type: "review_pain_point" as const,
    category: "review" as const,
    content: issue.title.trim(),
    source: "review_analysis" as const,
    sourceContext: "common_issues_theme",
    sourceContextId: `review_bridge_${slugify(issue.title)}`,
    metadata: {
      category: "review",
      source_origin: "review_analysis",
      from_review_insights: true,
      review_derived: true,
      signal_kind: "pain_point",
      severity: issue.severity,
      impact_percent: Math.round(issue.impact * 100),
      description: issue.description,
      quote: issue.quote,
      package_name: ctx.packageName,
      country: ctx.country,
      lang_code: ctx.langCode,
      analysis_transaction_id: ctx.transactionId,
      last_analysis_timestamp: ctx.lastAnalysisTimestamp,
      analysis_status: REVIEW_ANALYSIS_STATUS_SUCCESS,
    },
  }));
}

/**
 * ReviewInsightBridge — on successful Vertex/Gemini analysis, push top pain points
 * into the Optimization Queue (Active Context SSOT) for the Listing Optimizer.
 */
export async function bridgeReviewInsightsToActiveContext(
  supabase: SupabaseClient,
  input: ReviewInsightBridgeInput,
): Promise<ReviewInsightBridgeResult> {
  const inputs = mapIssuesToQueueInputs(input.issues, input);
  if (inputs.length === 0) {
    return { ok: true, bridgedCount: 0, skippedCount: 0 };
  }

  const appId =
    input.appId ??
    (await resolveAppIdByPackage(supabase, input.workspaceId, input.packageName));

  if (!appId) {
    return {
      ok: false,
      bridgedCount: 0,
      skippedCount: 0,
      error: "no_app_for_bridge",
    };
  }

  try {
    await purgeReviewDerivedFromQueue(supabase, input.workspaceId, input.locale, {
      appId,
      userId: input.userId,
    });

    const result = await addToOptimizationQueue(
      supabase,
      input.workspaceId,
      input.locale,
      inputs,
      { appId, userId: input.userId },
    );

    return {
      ok: true,
      bridgedCount: result.addedCount,
      skippedCount: result.skippedCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ReviewInsightBridge] failed:", message);
    return {
      ok: false,
      bridgedCount: 0,
      skippedCount: 0,
      error: message,
    };
  }
}

async function resolveAppIdByPackage(
  supabase: SupabaseClient,
  workspaceId: string,
  packageName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("apps")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("package_name", packageName.trim())
    .maybeSingle();

  if (error) {
    console.warn("[ReviewInsightBridge] app lookup failed:", error.message);
    return resolveVaultAppId(supabase, workspaceId, null);
  }

  return (data?.id as string | undefined) ?? resolveVaultAppId(supabase, workspaceId, null);
}
