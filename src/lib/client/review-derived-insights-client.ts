import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import type { ReviewAnalysisStatus } from "@/lib/review-insights/credit-gate";

export type ReviewCurationResponse = {
  ok: boolean;
  valid: boolean;
  analysisStatus: ReviewAnalysisStatus;
  lastAnalysisTimestamp: string | null;
  transactionId: string | null;
  pendingInsights: PendingReviewInsight[];
  adoptedInsights: PendingReviewInsight[];
  cluster?: {
    packageName: string;
    langCode: string;
    country: string;
  } | null;
};

export async function fetchReviewCurationInsights(
  workspaceId: string,
  params: {
    locale: "en" | "ar";
    appId?: string;
    packageName?: string;
    langCode?: string;
    country?: string;
  },
): Promise<ReviewCurationResponse> {
  const search = new URLSearchParams({ locale: params.locale });
  if (params.appId) search.set("appId", params.appId);
  if (params.packageName) search.set("packageName", params.packageName);
  if (params.langCode) search.set("langCode", params.langCode);
  if (params.country) search.set("country", params.country);

  const res = await fetch(
    `/api/workspaces/${workspaceId}/reviews/review-derived?${search.toString()}`,
    { credentials: "same-origin" },
  );

  if (!res.ok) {
    return {
      ok: false,
      valid: false,
      analysisStatus: "NOT_FOUND",
      lastAnalysisTimestamp: null,
      transactionId: null,
      pendingInsights: [],
      adoptedInsights: [],
    };
  }

  return (await res.json()) as ReviewCurationResponse;
}

export async function adoptPendingInsightClient(
  workspaceId: string,
  insightId: string,
  params: { locale: "en" | "ar"; appId?: string },
): Promise<{ ok: boolean; error?: string; queueItemId?: string }> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/reviews/pending-insights/${insightId}/adopt`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );

  const json = (await res.json()) as { ok?: boolean; error?: string; queueItemId?: string };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error ?? "Adopt failed" };
  }
  return { ok: true, queueItemId: json.queueItemId };
}

export async function dismissPendingInsightClient(
  workspaceId: string,
  insightId: string,
): Promise<boolean> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/reviews/pending-insights/${insightId}/dismiss`,
    { method: "POST", credentials: "same-origin" },
  );
  const json = (await res.json()) as { ok?: boolean };
  return res.ok && json.ok === true;
}

/** @deprecated use fetchReviewCurationInsights */
export const fetchReviewDerivedInsights = fetchReviewCurationInsights;
