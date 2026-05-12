import type { AppLimitsData } from "@/hooks/use-app-limits";

export type AddAppPrecheck =
  | { outcome: "allow" }
  | { outcome: "deny_upgrade"; snapshot: AppLimitsData }
  | { outcome: "deny_wait" }
  | { outcome: "deny_limits_failed" };

type LimitsQueryLike = {
  data: AppLimitsData | undefined;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Client-side guard before POST /apps or navigating to Settings → Apps (#workspace-apps).
 * Keep in sync with GET /api/workspaces/:id/app-limits (useAppLimits) and server canAddNewApp().
 */
export function precheckAddApp(limits: LimitsQueryLike): AddAppPrecheck {
  if (limits.isLoading) return { outcome: "deny_wait" };
  if (limits.isError) return { outcome: "deny_limits_failed" };
  if (limits.data && !limits.data.allowed) {
    return { outcome: "deny_upgrade", snapshot: limits.data };
  }
  return { outcome: "allow" };
}
