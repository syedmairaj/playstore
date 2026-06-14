import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OptimizationQueueItem, OptimizationQueueLocale } from "@/lib/optimization-queue";
import {
  purgeReviewDerivedFromQueue,
} from "@/lib/optimization-queue/optimization-queue.service";
import { listPendingReviewInsights } from "@/lib/review-insights/pending-insights.service";
import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import {
  REVIEW_ANALYSIS_CACHE_TTL_MS,
  REVIEW_ANALYSIS_FEATURE,
} from "@/lib/review-insights/constants";

export type ReviewAnalysisStatus =
  | "SUCCESS_PAID"
  | "EXPIRED"
  | "MISSING_TRANSACTION"
  | "INVALID_TRANSACTION"
  | "NOT_FOUND"
  | "REFUNDED";

export type ReviewAnalysisCluster = {
  packageName: string;
  langCode: string;
  country: string;
};

type InsightRow = {
  id: string;
  insights: unknown;
  updated_at: string;
  analysis_transaction_id: string | null;
};

export type ReviewInsightsCreditGateResult = {
  valid: boolean;
  status: ReviewAnalysisStatus;
  lastAnalysisTimestamp: string | null;
  transactionId: string | null;
  cluster: ReviewAnalysisCluster | null;
  /** @deprecated use pendingInsights — active queue items are no longer auto-bridged */
  items: OptimizationQueueItem[];
  pendingInsights: PendingReviewInsight[];
  adoptedInsights: PendingReviewInsight[];
};

function isReviewDerivedItem(item: OptimizationQueueItem): boolean {
  return (
    item.type === "review_pain_point" &&
    (item.metadata.review_derived === true || item.metadata.from_review_insights === true)
  );
}

function isCacheFresh(updatedAt: string): boolean {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs >= 0 && ageMs < REVIEW_ANALYSIS_CACHE_TTL_MS;
}

async function loadInsightRow(
  workspaceId: string,
  cluster: ReviewAnalysisCluster,
): Promise<InsightRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("competitor_insights")
    .select("id, insights, updated_at, analysis_transaction_id")
    .eq("workspace_id", workspaceId)
    .eq("package_name", cluster.packageName)
    .eq("lang_code", cluster.langCode)
    .eq("country", cluster.country)
    .maybeSingle();

  if (error || !data || !Array.isArray(data.insights)) {
    return null;
  }
  return data as InsightRow;
}

/**
 * Verifies the credits_ledger debit tied to a review analysis is real and not refunded.
 */
export async function verifyReviewAnalysisTransaction(
  supabase: SupabaseClient,
  workspaceId: string,
  transactionId: string,
): Promise<boolean> {
  const { data: debit, error } = await supabase
    .from("credits_ledger")
    .select("id, amount, meta, workspace_id")
    .eq("id", transactionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !debit) return false;
  if (typeof debit.amount !== "number" || debit.amount >= 0) return false;

  const meta = debit.meta as Record<string, unknown> | null;
  if (meta?.feature !== REVIEW_ANALYSIS_FEATURE) return false;

  const { count, error: refundError } = await supabase
    .from("credits_ledger")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("source_type", "refund")
    .contains("meta", { refunded_ledger_id: transactionId });

  if (refundError) return false;
  return (count ?? 0) === 0;
}

/**
 * CreditGate — workspace must have a fresh, paid review analysis before review-derived
 * Active Context is exposed to the Listing Optimizer.
 */
export async function resolveReviewInsightsCreditGate(
  supabase: SupabaseClient,
  workspaceId: string,
  options: {
    locale: OptimizationQueueLocale;
    appId?: string | null;
    cluster?: Partial<ReviewAnalysisCluster>;
    userId?: string;
    purgeOnInvalid?: boolean;
  },
): Promise<ReviewInsightsCreditGateResult> {
  const cluster = await resolveReviewCluster(supabase, workspaceId, options.cluster);
  if (!cluster) {
    return emptyGate("NOT_FOUND", null);
  }

  const row = await loadInsightRow(workspaceId, cluster);
  if (!row) {
    if (options.purgeOnInvalid !== false) {
      await purgeReviewDerivedFromQueue(supabase, workspaceId, options.locale, {
        appId: options.appId,
        userId: options.userId,
      });
    }
    return emptyGate("NOT_FOUND", cluster);
  }

  if (!isCacheFresh(row.updated_at)) {
    if (options.purgeOnInvalid !== false) {
      await purgeReviewDerivedFromQueue(supabase, workspaceId, options.locale, {
        appId: options.appId,
        userId: options.userId,
      });
    }
    return {
      valid: false,
      status: "EXPIRED",
      lastAnalysisTimestamp: row.updated_at,
      transactionId: row.analysis_transaction_id,
      cluster,
      items: [],
      pendingInsights: [],
      adoptedInsights: [],
    };
  }

  const transactionId = row.analysis_transaction_id;
  if (!transactionId) {
    if (options.purgeOnInvalid !== false) {
      await purgeReviewDerivedFromQueue(supabase, workspaceId, options.locale, {
        appId: options.appId,
        userId: options.userId,
      });
    }
    return {
      valid: false,
      status: "MISSING_TRANSACTION",
      lastAnalysisTimestamp: row.updated_at,
      transactionId: null,
      cluster,
      items: [],
      pendingInsights: [],
      adoptedInsights: [],
    };
  }

  const txnValid = await verifyReviewAnalysisTransaction(
    supabase,
    workspaceId,
    transactionId,
  );
  if (!txnValid) {
    if (options.purgeOnInvalid !== false) {
      await purgeReviewDerivedFromQueue(supabase, workspaceId, options.locale, {
        appId: options.appId,
        userId: options.userId,
      });
    }
    return {
      valid: false,
      status: "INVALID_TRANSACTION",
      lastAnalysisTimestamp: row.updated_at,
      transactionId,
      cluster,
      items: [],
      pendingInsights: [],
      adoptedInsights: [],
    };
  }

  const pendingInsights = await listPendingReviewInsights(supabase, {
    workspaceId,
    packageName: cluster.packageName,
    langCode: cluster.langCode,
    country: cluster.country,
  }, {
    analysisTransactionId: transactionId,
    statuses: ["pending"],
  });

  const adoptedInsights = await listPendingReviewInsights(supabase, {
    workspaceId,
    packageName: cluster.packageName,
    langCode: cluster.langCode,
    country: cluster.country,
  }, {
    analysisTransactionId: transactionId,
    statuses: ["adopted"],
  });

  return {
    valid: true,
    status: "SUCCESS_PAID",
    lastAnalysisTimestamp: row.updated_at,
    transactionId,
    cluster,
    items: [],
    pendingInsights,
    adoptedInsights,
  };
}

/** @alias resolveReviewInsightsCreditGate */
export const hasValidReviewAnalysis = resolveReviewInsightsCreditGate;

async function resolveReviewCluster(
  supabase: SupabaseClient,
  workspaceId: string,
  partial?: Partial<ReviewAnalysisCluster>,
): Promise<ReviewAnalysisCluster | null> {
  const packageName = partial?.packageName?.trim();
  const langCode = partial?.langCode?.trim() || "en";
  const country = partial?.country?.trim().toLowerCase() || "us";

  if (packageName) {
    return { packageName, langCode, country };
  }

  const { data, error } = await supabase
    .from("apps")
    .select("package_name, target_countries")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.package_name) return null;

  const targetCountry =
    Array.isArray(data.target_countries) && typeof data.target_countries[0] === "string"
      ? data.target_countries[0].trim().toLowerCase()
      : country;

  return {
    packageName: String(data.package_name).trim(),
    langCode,
    country: targetCountry.length === 2 ? targetCountry : country,
  };
}

function emptyGate(
  status: ReviewAnalysisStatus,
  cluster: ReviewAnalysisCluster | null,
): ReviewInsightsCreditGateResult {
  return {
    valid: false,
    status,
    lastAnalysisTimestamp: null,
    transactionId: null,
    cluster,
    items: [],
    pendingInsights: [],
    adoptedInsights: [],
  };
}

export function stripReviewDerivedQueueItems(
  items: OptimizationQueueItem[],
): OptimizationQueueItem[] {
  return items.filter((item) => !isReviewDerivedItem(item));
}
