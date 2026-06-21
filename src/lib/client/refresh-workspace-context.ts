import { fetchOptimizerContext } from "@/lib/client/workspace-query-fetchers";
import type { VaultLocale } from "@/hooks/useOptimizerSync";

export type RefreshWorkspaceContextOptions = {
  workspaceId: string;
  vaultLocale?: VaultLocale;
  appId?: string;
};

export type RefreshWorkspaceContextResult = {
  creditsRemaining?: number;
};

/**
 * Re-syncs optimizer + billing state from Keyword Tracker after a workspace handshake failure.
 */
export async function refreshWorkspaceContext(
  options: RefreshWorkspaceContextOptions,
): Promise<RefreshWorkspaceContextResult> {
  const { workspaceId, vaultLocale = "en" } = options;

  const tasks: Promise<unknown>[] = [
    fetchOptimizerContext(workspaceId, vaultLocale),
  ];

  if (options.appId?.trim()) {
    tasks.push(
      fetch(
        `/api/workspaces/${workspaceId}/keywords/signals?appId=${encodeURIComponent(options.appId.trim())}&locale=${vaultLocale}`,
        { credentials: "same-origin" },
      ).catch(() => null),
    );
  }

  const usagePromise = fetch(
    `/api/workspaces/${workspaceId}/billing/usage-summary`,
    { credentials: "same-origin" },
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  tasks.push(usagePromise);

  const results = await Promise.all(tasks);
  const usageJson = results[results.length - 1] as
    | { ok?: boolean; data?: { credits?: { remaining?: number } } }
    | null;

  return {
    creditsRemaining:
      usageJson?.ok && typeof usageJson.data?.credits?.remaining === "number"
        ? usageJson.data.credits.remaining
        : undefined,
  };
}
