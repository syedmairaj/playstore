import { createClient } from "@/lib/supabase/server";
import { maxAppSlotsForPlan, normalizePlan, type PlanId, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import type { SupabaseClient } from "@supabase/supabase-js";

export { UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";

export type CanAddNewAppResult = {
  allowed: boolean;
  currentCount: number;
  /** Max apps for the plan, or {@link UNLIMITED_APP_SLOTS} when unlimited. */
  limit: number;
  /** Normalized plan slug (`free` | `pro` | `growth`), or `anonymous` / `unknown` when not applicable. */
  plan: string;
  message?: string;
};

/**
 * Best-effort billing plan from `user_subscriptions` (when the table exists),
 * then `workspaces.plan`. Optional Clerk `publicMetadata` is used only when
 * passed explicitly (e.g. future server route that has Clerk context).
 */
export async function resolveWorkspaceBillingPlan(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  opts?: { clerkPublicMetadata?: Record<string, unknown> | null },
): Promise<{ rawPlan: string; normalized: PlanId }> {
  const subByWorkspace = await supabase
    .from("user_subscriptions")
    .select("plan, status")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();

  if (!subByWorkspace.error && subByWorkspace.data?.plan) {
    const raw = String(subByWorkspace.data.plan);
    return { rawPlan: raw, normalized: normalizePlan(raw) };
  }

  const missingRelation =
    !!subByWorkspace.error &&
    ((subByWorkspace.error.message ?? "").toLowerCase().includes("user_subscriptions") ||
      (subByWorkspace.error.message ?? "").toLowerCase().includes("schema cache") ||
      subByWorkspace.error.code === "PGRST205");

  if (!missingRelation) {
    const subByUser = await supabase
      .from("user_subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subByUser.error && subByUser.data?.plan) {
      const raw = String(subByUser.data.plan);
      return { rawPlan: raw, normalized: normalizePlan(raw) };
    }
  }

  const meta = opts?.clerkPublicMetadata;
  if (meta && typeof meta === "object") {
    const fromMeta =
      (typeof meta.subscriptionPlan === "string" && meta.subscriptionPlan) ||
      (typeof meta.plan === "string" && meta.plan) ||
      (typeof meta.billingPlan === "string" && meta.billingPlan) ||
      null;
    if (fromMeta) {
      return { rawPlan: fromMeta, normalized: normalizePlan(fromMeta) };
    }
  }

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("plan")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!wsErr && ws?.plan != null) {
    const raw = String(ws.plan);
    return { rawPlan: raw, normalized: normalizePlan(raw) };
  }

  return { rawPlan: "free", normalized: "free" };
}

function buildLimitMessage(plan: PlanId, limit: number): string {
  if (plan === "free") {
    return `Your Free plan includes ${limit} app. Upgrade to Pro (up to 5 apps) or Growth (unlimited apps).`;
  }
  if (plan === "pro") {
    return `Pro includes up to ${limit} apps. Upgrade to Growth for unlimited apps.`;
  }
  return "You have reached the app limit for your current plan.";
}

/**
 * Server-only: uses the Supabase cookie client. Do not import from client components.
 *
 * Plan resolution: `user_subscriptions` (workspace, then user) when available,
 * then optional Clerk-style metadata from `opts`, then `workspaces.plan`.
 */
export async function canAddNewApp(
  workspaceId: string,
  opts?: { clerkPublicMetadata?: Record<string, unknown> | null },
): Promise<CanAddNewAppResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      allowed: false,
      currentCount: 0,
      limit: 0,
      plan: "anonymous",
      message: "Sign in to add apps to this workspace.",
    };
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return {
      allowed: false,
      currentCount: 0,
      limit: 0,
      plan: "unknown",
      message: "You do not have access to this workspace.",
    };
  }

  const { count, error: countError } = await supabase
    .from("apps")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const currentCount = typeof count === "number" && !countError ? count : 0;

  const { normalized: plan } = await resolveWorkspaceBillingPlan(
    supabase,
    workspaceId,
    user.id,
    opts,
  );

  const limit = maxAppSlotsForPlan(plan);

  if (limit === UNLIMITED_APP_SLOTS) {
    return {
      allowed: true,
      currentCount,
      limit: UNLIMITED_APP_SLOTS,
      plan,
    };
  }

  const allowed = currentCount < limit;
  return {
    allowed,
    currentCount,
    limit,
    plan,
    message: allowed ? undefined : buildLimitMessage(plan, limit),
  };
}
