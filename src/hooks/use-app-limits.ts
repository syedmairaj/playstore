"use client";

import { useQuery } from "@tanstack/react-query";
import { queryDefaultsFor } from "@/lib/client/query-cache-policy";
import { fetchWorkspaceAppLimits } from "@/lib/client/workspace-query-fetchers";

export const appLimitsQueryKey = (workspaceId: string | undefined) =>
  ["app-limits", workspaceId ?? ""] as const;

export const workspaceAppsQueryKey = (workspaceId: string | undefined) =>
  ["workspace-apps", workspaceId ?? ""] as const;

export type AppLimitsData = {
  allowed: boolean;
  currentCount: number;
  limit: number;
  plan: string;
  message?: string;
};

export function useAppLimits(
  workspaceId: string | undefined,
  options?: { initialData?: AppLimitsData },
) {
  const cacheDefaults = queryDefaultsFor("workspaceMeta", { reconcileOnMount: true });
  return useQuery({
    queryKey: appLimitsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    ...cacheDefaults,
    ...(options?.initialData ? { initialData: options.initialData } : {}),
    queryFn: () => fetchWorkspaceAppLimits(workspaceId!),
  });
}
