"use client";

import { useQuery } from "@tanstack/react-query";

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

type ApiOk = { ok: true } & AppLimitsData;
type ApiErr = { ok: false; error: { code?: string; message: string } };

export function useAppLimits(
  workspaceId: string | undefined,
  options?: { initialData?: AppLimitsData },
) {
  return useQuery({
    queryKey: appLimitsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    ...(options?.initialData
      ? { initialData: options.initialData, staleTime: 30_000 }
      : {}),
    queryFn: async (): Promise<AppLimitsData> => {
      const res = await fetch(`/api/workspaces/${workspaceId}/app-limits`, {
        credentials: "include",
      });
      const json = (await res.json()) as ApiOk | ApiErr;
      if (!res.ok || !json.ok) {
        const msg = json.ok === false ? json.error.message : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const { allowed, currentCount, limit, plan, message } = json;
      return { allowed, currentCount, limit, plan, ...(message !== undefined ? { message } : {}) };
    },
  });
}
