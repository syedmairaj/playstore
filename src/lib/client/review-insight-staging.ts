import type { IssueSeverity } from "@/lib/gemini/generate-review-analysis";
import type { ReviewInsightCategory } from "@/lib/review-insights/pending-insights.types";
import { dispatchStagingVaultChanged } from "@/lib/client/staging-vault-sync";

export const REVIEW_INSIGHT_STAGED_EVENT = "playstore:review-insight-staged" as const;
export const REVIEW_INSIGHT_ARCHIVED_EVENT = "playstore:review-insight-archived" as const;

export type ReviewInsightStagedDetail = {
  workspaceId: string;
  queueItemId: string;
  packageName: string;
  title: string;
};

export type ReviewInsightArchivedDetail = {
  workspaceId: string;
  queueItemId: string;
  backlogId: string;
  title: string;
};

export function dispatchReviewInsightStaged(detail: ReviewInsightStagedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REVIEW_INSIGHT_STAGED_EVENT, { detail }));
}

export function dispatchReviewInsightArchived(detail: ReviewInsightArchivedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REVIEW_INSIGHT_ARCHIVED_EVENT, { detail }));
}

export type StageReviewIssueClientInput = {
  packageName: string;
  countryCode: string;
  langCode: string;
  locale: "en" | "ar";
  appId?: string;
  competitorName?: string | null;
  sourceType?: "common_issues_cluster" | "individual_review";
  sourceContextId: string;
  issue: {
    title: string;
    description: string;
    severity: IssueSeverity;
    impact: number;
    quote?: string;
    category?: ReviewInsightCategory;
  };
};

export async function stageReviewIssueClient(
  workspaceId: string,
  input: StageReviewIssueClientInput,
): Promise<
  | { ok: true; queueItemId: string; stagedAt: string; title: string }
  | { ok: false; error: string }
> {
  const res = await fetch(`/api/workspaces/${workspaceId}/reviews/stage-issue`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    queueItemId?: string;
    stagedAt?: string;
    title?: string;
  };

  if (!res.ok || !json.ok || !json.queueItemId) {
    return { ok: false, error: json.error ?? "Failed to stage insight." };
  }

  const title = json.title ?? input.issue.title;

  dispatchReviewInsightStaged({
    workspaceId,
    queueItemId: json.queueItemId,
    packageName: input.packageName,
    title,
  });
  dispatchStagingVaultChanged({
    workspaceId,
    appId: input.appId,
    locale: input.locale,
  });

  return {
    ok: true,
    queueItemId: json.queueItemId,
    stagedAt: json.stagedAt ?? new Date().toISOString(),
    title,
  };
}

export async function archiveReviewFromActiveClient(
  workspaceId: string,
  queueItemId: string,
  params: {
    locale: "en" | "ar";
    appId?: string;
    title?: string;
    content?: string;
    type?: "review_pain_point" | "feature_request";
    metadata?: Record<string, unknown>;
    /** When false, skip window events (e.g. archive was undone before the API returned). */
    dispatchEvents?: boolean;
  },
): Promise<{ ok: boolean; error?: string; backlogId?: string }> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/reviews/archive-from-active/${encodeURIComponent(queueItemId)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );

  const json = (await res.json()) as { ok?: boolean; error?: string; backlogId?: string };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error ?? "Archive failed" };
  }

  if (params.dispatchEvents !== false) {
    dispatchReviewInsightArchived({
      workspaceId,
      queueItemId,
      backlogId: json.backlogId ?? "",
      title: params.title ?? "",
    });
    dispatchStagingVaultChanged({
      workspaceId,
      appId: params.appId,
      locale: params.locale,
    });
  }

  return { ok: true, backlogId: json.backlogId };
}

export async function restoreStagedReviewClient(
  workspaceId: string,
  backlogId: string,
  params: { locale: "en" | "ar"; appId?: string; dispatchEvent?: boolean },
): Promise<{ ok: boolean; error?: string; queueItemId?: string; title?: string }> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/reviews/restore-issue/${backlogId}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: params.locale, appId: params.appId }),
    },
  );

  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    queueItemId?: string;
    title?: string;
  };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error ?? "Restore failed" };
  }

  if (params.dispatchEvent !== false) {
    dispatchReviewInsightStaged({
      workspaceId,
      queueItemId: json.queueItemId ?? "",
      packageName: "",
      title: json.title ?? "",
    });
    dispatchStagingVaultChanged({ workspaceId, appId: params.appId, locale: params.locale });
  }

  return { ok: true, queueItemId: json.queueItemId, title: json.title };
}

export async function deleteStagedReviewClient(
  workspaceId: string,
  backlogId: string,
): Promise<boolean> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/reviews/restore-issue/${backlogId}`,
    { method: "DELETE", credentials: "same-origin" },
  );
  const json = (await res.json()) as { ok?: boolean };
  return res.ok && json.ok === true;
}
