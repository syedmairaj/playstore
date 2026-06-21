import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type GrantWorkspaceCreditsResult =
  | { ok: true; balanceAfter: number; ledgerId: string }
  | { ok: false; code: string; message: string };

/**
 * Grants one-time purchased credits — positive ledger row, no subscription side effects.
 */
export async function grantWorkspaceAiCredits(
  admin: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    amount: number;
    description: string;
    meta?: Record<string, unknown>;
  },
): Promise<GrantWorkspaceCreditsResult> {
  const amount = Math.floor(params.amount);
  if (amount < 1) {
    return { ok: false, code: "invalid_amount", message: "Credit amount must be positive." };
  }

  const { data: workspace, error: wsError } = await admin
    .from("workspaces")
    .select("id, ai_credits_remaining")
    .eq("id", params.workspaceId)
    .maybeSingle();

  if (wsError || !workspace) {
    return { ok: false, code: "workspace_not_found", message: "Workspace not found." };
  }

  const current =
    typeof workspace.ai_credits_remaining === "number"
      ? workspace.ai_credits_remaining
      : 0;
  const balanceAfter = current + amount;

  const { data: ledgerRow, error: ledgerError } = await admin
    .from("credits_ledger")
    .insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      amount,
      description: params.description,
      source_type: "purchase",
      meta: params.meta ?? null,
    })
    .select("id")
    .single();

  if (ledgerError || !ledgerRow) {
    return {
      ok: false,
      code: "ledger_insert_failed",
      message: ledgerError?.message ?? "Could not record purchase.",
    };
  }

  const { error: updateError } = await admin
    .from("workspaces")
    .update({ ai_credits_remaining: balanceAfter })
    .eq("id", params.workspaceId);

  if (updateError) {
    return {
      ok: false,
      code: "balance_update_failed",
      message: updateError.message,
    };
  }

  return { ok: true, balanceAfter, ledgerId: ledgerRow.id };
}
