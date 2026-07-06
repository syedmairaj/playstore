import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const USAGE_ALERT_THRESHOLD = 0.8;

function currentBillingMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Insert a workspace alert when monthly credit usage crosses 80% of `monthly_credit_cap`.
 * Deduped to one alert per workspace per billing month.
 */
export async function maybeCreateCreditBudgetAlert(params: {
  workspaceId: string;
  /** Remaining credits after the latest debit (optional — fetched when omitted). */
  creditsRemaining?: number;
  supabase?: SupabaseClient;
}): Promise<void> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) return;

  let client = params.supabase;
  if (!client) {
    try {
      client = getSupabaseAdmin();
    } catch {
      return;
    }
  }

  const { data: workspace, error: wsErr } = await client
    .from("workspaces")
    .select(
      "monthly_credit_cap,ai_credits_remaining,ai_credits_monthly_allocation",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsErr || !workspace) return;

  const cap =
    typeof workspace.monthly_credit_cap === "number"
      ? workspace.monthly_credit_cap
      : null;
  if (cap == null || cap <= 0) return;

  const allocation =
    typeof workspace.ai_credits_monthly_allocation === "number"
      ? workspace.ai_credits_monthly_allocation
      : 0;
  const remaining =
    typeof params.creditsRemaining === "number"
      ? params.creditsRemaining
      : typeof workspace.ai_credits_remaining === "number"
        ? workspace.ai_credits_remaining
        : 0;

  const used = Math.max(0, allocation - remaining);
  const threshold = Math.ceil(cap * USAGE_ALERT_THRESHOLD);

  if (used < threshold) return;

  const monthKey = currentBillingMonthKey();

  const { data: existing } = await client
    .from("workspace_alerts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "credit_budget_warning")
    .filter("meta->>billingMonth", "eq", monthKey)
    .maybeSingle();

  if (existing) return;

  const usedPct = Math.round((used / cap) * 100);

  await client.from("workspace_alerts").insert({
    workspace_id: workspaceId,
    keyword_id: null,
    type: "credit_budget_warning",
    title: "Monthly credit cap nearly reached",
    body: `You've used ${used} of your ${cap} credit monthly cap (${usedPct}%). Consider raising your cap or reducing AI usage.`,
    severity: used >= cap ? "warning" : "info",
    meta: {
      billingMonth: monthKey,
      cap,
      used,
      usedPercent: usedPct,
      thresholdPercent: Math.round(USAGE_ALERT_THRESHOLD * 100),
    },
  });
}
