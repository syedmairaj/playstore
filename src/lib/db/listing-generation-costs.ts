import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ListingGenerationCostPhase = "title" | "short" | "long" | "full";

export type LogGenerationCostParams = {
  workspaceId: string;
  queueHash: string;
  phase: ListingGenerationCostPhase;
  tokensUsed: number;
  creditCost?: number;
};

export type UsageBreakdownRow = {
  phase: ListingGenerationCostPhase;
  totalTokens: number;
  totalCredits: number;
};

/**
 * Persist per-phase listing generation metrics (service role — RLS is select-only).
 */
export async function logGenerationCost(
  params: LogGenerationCostParams,
): Promise<void> {
  const workspaceId = params.workspaceId.trim();
  const queueHash = params.queueHash.trim();
  const tokensUsed = Math.max(0, Math.floor(params.tokensUsed));
  const creditCost = Math.max(0, params.creditCost ?? 0);

  if (!workspaceId || !queueHash) {
    return;
  }
  if (tokensUsed === 0 && creditCost === 0) {
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_cost_log_skipped",
        reason: "admin_unavailable",
        workspaceId,
        phase: params.phase,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return;
  }

  const { error } = await admin.from("listing_generation_costs").insert({
    workspace_id: workspaceId,
    queue_hash: queueHash,
    phase: params.phase,
    tokens_used: tokensUsed,
    credit_cost: creditCost,
  });

  if (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_cost_log_failed",
        workspaceId,
        queueHash,
        phase: params.phase,
        message: error.message,
      }),
    );
  }
}

export async function fetchListingGenerationUsageBreakdown(
  workspaceId: string,
): Promise<UsageBreakdownRow[]> {
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return [];
  }

  const { data, error } = await admin
    .from("listing_generation_costs")
    .select("phase, tokens_used, credit_cost")
    .eq("workspace_id", workspaceId);

  if (error || !data) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_usage_breakdown_failed",
        workspaceId,
        message: error?.message ?? "no data",
      }),
    );
    return [];
  }

  const grouped = new Map<ListingGenerationCostPhase, UsageBreakdownRow>();
  const phaseOrder: ListingGenerationCostPhase[] = ["title", "short", "long", "full"];

  for (const row of data) {
    const phase = row.phase as ListingGenerationCostPhase;
    if (!phaseOrder.includes(phase)) continue;
    const existing = grouped.get(phase) ?? {
      phase,
      totalTokens: 0,
      totalCredits: 0,
    };
    existing.totalTokens += typeof row.tokens_used === "number" ? row.tokens_used : 0;
    existing.totalCredits += Number(row.credit_cost ?? 0);
    grouped.set(phase, existing);
  }

  return phaseOrder
    .filter((phase) => grouped.has(phase))
    .map((phase) => grouped.get(phase)!);
}
