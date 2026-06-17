/**
 * Shared fetchers for workspace-scoped React Query keys.
 * Used by hooks and safe prefetch helpers — keeps API URLs in one place.
 */

import { isRetryableNetworkError } from "@/lib/client/query-network-retry";
import type { AppLimitsData } from "@/hooks/use-app-limits";
import type { VaultLocale } from "@/hooks/useOptimizerSync";

async function fetchJsonWithNetworkRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRetryableNetworkError(err)) {
      throw new Error(`ERR_NETWORK_CHANGED: ${message}`);
    }
    throw err;
  }
}

export type WorkspaceAppRow = {
  id: string;
  name: string;
  package_name: string | null;
  metadata: Record<string, unknown> | null;
  icon_url: string | null;
};

type AppsApiBody = {
  ok?: boolean;
  apps?: {
    id: string;
    name: string;
    package_name?: string | null;
    metadata?: Record<string, unknown> | null;
    icon_url?: string | null;
  }[];
  error?: { message?: string };
};

export async function fetchWorkspaceApps(
  workspaceId: string,
): Promise<WorkspaceAppRow[]> {
  const res = await fetch(`/api/workspaces/${workspaceId}/apps`, {
    credentials: "include",
  });
  const raw = await res.text();
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(res.ok ? "Invalid apps response" : `Apps request failed (${res.status})`);
  }
  const body = json as AppsApiBody;
  if (!res.ok) {
    throw new Error(body.error?.message ?? `Apps request failed (${res.status})`);
  }
  if (body.ok !== true) {
    throw new Error(body.error?.message ?? "Apps request failed");
  }
  return (body.apps ?? []).map((a) => ({
    id: String(a.id ?? ""),
    name: String(a.name ?? ""),
    package_name:
      typeof a.package_name === "string" && a.package_name.trim()
        ? a.package_name.trim()
        : null,
    metadata: a.metadata ?? null,
    icon_url:
      typeof a.icon_url === "string" && a.icon_url.trim() ? a.icon_url.trim() : null,
  }));
}

type LimitsApiOk = { ok: true } & AppLimitsData;
type LimitsApiErr = { ok: false; error: { message: string } };

export async function fetchWorkspaceAppLimits(
  workspaceId: string,
): Promise<AppLimitsData> {
  const res = await fetch(`/api/workspaces/${workspaceId}/app-limits`, {
    credentials: "include",
  });
  const json = (await res.json()) as LimitsApiOk | LimitsApiErr;
  if (!res.ok || !json.ok) {
    const msg = json.ok === false ? json.error.message : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const { allowed, currentCount, limit, plan, message } = json;
  return { allowed, currentCount, limit, plan, ...(message !== undefined ? { message } : {}) };
}

export async function fetchOptimizerContext(
  workspaceId: string,
  vaultLocale: VaultLocale,
  appId?: string,
) {
  const params = new URLSearchParams({ locale: vaultLocale });
  if (appId) params.set("appId", appId);
  const response = await fetchJsonWithNetworkRetry(
    `/api/workspaces/${workspaceId}/optimizer/context?${params.toString()}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch optimizer context: ${response.status}`);
  }
  return response.json();
}
