import "server-only";

import { createClient } from "@/lib/supabase/server";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";

export { getMonthlyServerCostUsd, serverCostForChartDays } from "@/lib/admin/server-cost";

/** Provider COGS estimates (USD); labeled as estimated in UI when no token-level data. */
export const ADMIN_COGS = {
  geminiListingPerGeneration: 0.02,
  runwarePerLogoBatch: 0.032, // FLUX.1 [dev] @ ~$0.008/image × 4 images
  /** Small Gemini calls (autofill, suggest) — rough $ per AI credit consumed. */
  geminiSmallPerCredit: 0.0008,
} as const;

export type AdminFinancialRpcWorkspace = {
  id: string;
  name: string;
  plan: string;
  ai_credits_remaining: number;
  created_at: string;
  owner_id: string;
  owner_display_name: string | null;
  credits_spent_total: number;
  credits_purchased_total: number;
  listing_generations_total: number;
  logo_batches_total: number;
};

export type AdminFinancialRpcDay = {
  date: string;
  listing_aso_count: number;
  logo_batches: number;
  autofill_credits: number;
  suggest_credits: number;
  listing_ledger_credits: number;
  other_generation_credits: number;
  credits_purchased: number;
};

export type AdminFinancialSnapshot = {
  ok: true;
  series_from: string;
  series_to: string;
  workspaces: AdminFinancialRpcWorkspace[];
  daily_series: AdminFinancialRpcDay[];
  totals: {
    credits_purchased_all_time: number;
    credits_spent_all_time: number;
    listing_generations_all_time: number;
    workspace_count: number;
    has_payments_table: boolean;
  };
};

export function dayAiCostUsd(d: AdminFinancialRpcDay): number {
  const listing =
    d.listing_aso_count * ADMIN_COGS.geminiListingPerGeneration;
  const logos = d.logo_batches * ADMIN_COGS.runwarePerLogoBatch;
  const smallCredits =
    d.autofill_credits + d.suggest_credits + d.other_generation_credits;
  const small = smallCredits * ADMIN_COGS.geminiSmallPerCredit;
  return listing + logos + small;
}

export function estimateWorkspaceSystemCostUsd(
  w: AdminFinancialRpcWorkspace,
): number {
  const listing =
    w.listing_generations_total * ADMIN_COGS.geminiListingPerGeneration;
  const logos = w.logo_batches_total * ADMIN_COGS.runwarePerLogoBatch;
  const attributedCredits =
    w.listing_generations_total * AI_CREDIT_COSTS.listing_generation +
    w.logo_batches_total * AI_CREDIT_COSTS.listing_logo_generation;
  const rest = Math.max(0, w.credits_spent_total - attributedCredits);
  return listing + logos + rest * ADMIN_COGS.geminiSmallPerCredit;
}

export type AdminFinancialHealth = {
  periodLabel: string;
  grossRevenueUsd: number;
  stripeFeesUsd: number;
  aiCostsEstimatedUsd: number;
  serverCostUsd: number;
  netProfitUsd: number;
  marginPercent: number | null;
  hasPaymentsData: boolean;
  /** Sum of daily AI estimates in range (should match chart). */
  aiCostsSumCheckUsd: number;
};

function stripeFeeUsd(amount: number): number {
  if (amount <= 0) return 0;
  return amount * 0.029 + 0.3;
}

export function computeFinancialHealth(params: {
  daily_series: AdminFinancialRpcDay[];
  grossRevenueUsd: number;
  hasPaymentsData: boolean;
  /** Infrastructure cost attributed to the same calendar span as `daily_series`. */
  serverCostForPeriodUsd: number;
}): AdminFinancialHealth {
  const aiCostsEstimatedUsd = params.daily_series.reduce(
    (s, d) => s + dayAiCostUsd(d),
    0,
  );
  const stripeFeesUsd = params.hasPaymentsData
    ? stripeFeeUsd(params.grossRevenueUsd)
    : 0;
  const netProfitUsd =
    params.grossRevenueUsd -
    stripeFeesUsd -
    aiCostsEstimatedUsd -
    params.serverCostForPeriodUsd;
  const marginPercent =
    params.grossRevenueUsd > 0
      ? (netProfitUsd / params.grossRevenueUsd) * 100
      : null;
  return {
    periodLabel: "Last 30 days (estimated)",
    grossRevenueUsd: params.grossRevenueUsd,
    stripeFeesUsd,
    aiCostsEstimatedUsd,
    serverCostUsd: params.serverCostForPeriodUsd,
    netProfitUsd,
    marginPercent,
    hasPaymentsData: params.hasPaymentsData,
    aiCostsSumCheckUsd: aiCostsEstimatedUsd,
  };
}

const ADMIN_SNAPSHOT_RPC = "admin_financial_snapshot" as const;
const REPLICATION_LAG_RETRY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One RPC round-trip; does not check session (caller ensures uid). */
async function adminFinancialSnapshotOnce(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params?: { seriesFrom?: string; seriesTo?: string },
): Promise<
  | { ok: true; data: AdminFinancialSnapshot }
  | { ok: false; code: string }
> {
  const { data, error } = await supabase.rpc(ADMIN_SNAPSHOT_RPC, {
    p_series_from: params?.seriesFrom ?? null,
    p_series_to: params?.seriesTo ?? null,
  });
  if (error) {
    const code =
      error.code === "PGRST116" ? "PGRST116" : "rpc_error";
    if (code === "rpc_error") {
      console.error(ADMIN_SNAPSHOT_RPC, error.message);
    }
    return { ok: false, code };
  }
  const raw = data as Record<string, unknown> | null;
  if (!raw || raw.ok !== true) {
    const code =
      typeof raw?.code === "string" ? raw.code : "forbidden";
    return { ok: false, code };
  }
  const snap: AdminFinancialSnapshot = {
    ok: true,
    series_from: String(raw.series_from),
    series_to: String(raw.series_to),
    workspaces: (raw.workspaces as AdminFinancialRpcWorkspace[]) ?? [],
    daily_series: (raw.daily_series as AdminFinancialRpcDay[]) ?? [],
    totals: raw.totals as AdminFinancialSnapshot["totals"],
  };
  return { ok: true, data: snap };
}

function shouldRetryAdminSnapshotForReplicationLag(
  result: { ok: false; code: string },
): boolean {
  return result.code === "forbidden" || result.code === "PGRST116";
}

export async function fetchAdminFinancialSnapshot(params?: {
  seriesFrom?: string;
  seriesTo?: string;
}): Promise<
  | { ok: true; data: AdminFinancialSnapshot }
  | { ok: false; code: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { ok: false, code: "no_auth_uid" };
  }

  let result = await adminFinancialSnapshotOnce(supabase, params);
  if (
    !result.ok &&
    shouldRetryAdminSnapshotForReplicationLag(result)
  ) {
    await sleep(REPLICATION_LAG_RETRY_MS);
    result = await adminFinancialSnapshotOnce(supabase, params);
  }
  return result;
}

export function chartRowsFromDaily(
  daily: AdminFinancialRpcDay[],
): {
  date: string;
  dateLabel: string;
  revenueUsd: number;
  costsUsd: number;
}[] {
  return daily.map((d) => ({
    date: d.date,
    dateLabel: d.date.slice(5),
    revenueUsd: 0,
    costsUsd: dayAiCostUsd(d),
  }));
}
