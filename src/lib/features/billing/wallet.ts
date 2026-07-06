import type { SupabaseClient } from "@supabase/supabase-js";
import { maybeCreateCreditBudgetAlert } from "@/lib/features/billing/evaluate-credit-budget-alert";

/**
 * Wallet RPCs (`consume_workspace_ai_credits` / `refund_workspace_ai_credits`) debit under
 * a `SELECT … FOR UPDATE` on the workspace row so balance checks and debits are atomic.
 *
 * **Why not debit only after Gemini succeeds?** A post-success-only `consume` (with only a
 * prior non-locking read) would let concurrent requests pass a balance check, run the model,
 * and leave API cost uncovered. A safe “charge strictly after success” pattern needs a DB
 * **reservation / hold** spanning the model call (new tables/RPCs). Until then, routes use:
 * optional **read** of `ai_credits_remaining` → **`consume` before the model** →
 * **`refund` on failure** so the **net balance change matches a successful run** only.
 */

export type ConsumeWalletResult =
  | { ok: true; ledgerId: string; balanceAfter: number }
  | {
      ok: false;
      code: string;
      remaining?: number;
      required?: number;
    };

export type RefundWalletResult =
  | { ok: true; refundLedgerId: string; balanceAfter: number }
  | { ok: false; code: string };

function parseConsumePayload(raw: unknown): ConsumeWalletResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_response" };
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return {
      ok: false,
      code: typeof o.code === "string" ? o.code : "unknown",
      remaining: typeof o.remaining === "number" ? o.remaining : undefined,
      required: typeof o.required === "number" ? o.required : undefined,
    };
  }
  const ledgerId = o.ledger_id;
  const balanceAfter = o.balance_after;
  if (typeof ledgerId !== "string" || typeof balanceAfter !== "number") {
    return { ok: false, code: "invalid_response" };
  }
  return { ok: true, ledgerId, balanceAfter };
}

function parseRefundPayload(raw: unknown): RefundWalletResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_response" };
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, code: typeof o.code === "string" ? o.code : "unknown" };
  }
  const id = o.refund_ledger_id;
  const balanceAfter = o.balance_after;
  if (typeof id !== "string" || typeof balanceAfter !== "number") {
    return { ok: false, code: "invalid_response" };
  }
  return { ok: true, refundLedgerId: id, balanceAfter };
}

/**
 * Debit workspace credits and append an immutable ledger row (call before external AI; pair
 * with `refundWorkspaceAiCredits` on generation failure — see file-level note).
 */
export async function consumeWorkspaceAiCredits(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    amount: number;
    description: string;
    sourceType: "generation" | "purchase" | "refund" | "adjustment";
    meta?: Record<string, unknown>;
  },
): Promise<ConsumeWalletResult> {
  const { data, error } = await supabase.rpc("consume_workspace_ai_credits", {
    p_workspace_id: params.workspaceId,
    p_user_id: params.userId,
    p_amount: params.amount,
    p_description: params.description,
    p_source_type: params.sourceType,
    p_meta: params.meta ?? null,
  });
  if (error) {
    return { ok: false, code: "rpc_error", remaining: undefined, required: undefined };
  }
  const result = parseConsumePayload(data);
  if (result.ok) {
    void maybeCreateCreditBudgetAlert({
      workspaceId: params.workspaceId,
      creditsRemaining: result.balanceAfter,
      supabase,
    });
  }
  return result;
}

/**
 * Reverse a prior spend ledger row (e.g. Gemini failure after debit).
 */
export async function refundWorkspaceAiCredits(
  supabase: SupabaseClient,
  params: { ledgerId: string; userId: string; reason?: string | null },
): Promise<RefundWalletResult> {
  const { data, error } = await supabase.rpc("refund_workspace_ai_credits", {
    p_ledger_id: params.ledgerId,
    p_user_id: params.userId,
    p_reason: params.reason ?? null,
  });
  if (error) {
    return { ok: false, code: "rpc_error" };
  }
  return parseRefundPayload(data);
}
